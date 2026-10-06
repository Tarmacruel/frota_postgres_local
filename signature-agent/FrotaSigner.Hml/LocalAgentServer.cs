using System.Net;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FrotaSigner.Hml;

public sealed class LocalAgentServer : IAsyncDisposable
{
    private readonly SigningCoordinator _coordinator;
    private readonly BackendClient _backend;
    private readonly DeviceIdentityStore _identity;
    private readonly Dispatcher _dispatcher;
    private WebApplication? _application;

    public LocalAgentServer(
        SigningCoordinator coordinator,
        BackendClient backend,
        DeviceIdentityStore identity,
        Dispatcher dispatcher)
    {
        _coordinator = coordinator;
        _backend = backend;
        _identity = identity;
        _dispatcher = dispatcher;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var options = new WebApplicationOptions
        {
            Args = [],
            ApplicationName = typeof(LocalAgentServer).Assembly.FullName,
            ContentRootPath = AppContext.BaseDirectory,
        };
        var builder = WebApplication.CreateSlimBuilder(options);
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(server =>
        {
            server.Listen(IPAddress.Loopback, 54174, listen => listen.Protocols = HttpProtocols.Http1);
            server.Limits.MaxRequestBodySize = AgentOptions.MaxRequestBytes;
            server.AddServerHeader = false;
        });

        var app = builder.Build();
        app.Use(async (context, next) =>
        {
            if (!IPAddress.IsLoopback(context.Connection.RemoteIpAddress ?? IPAddress.None))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }

            context.Response.Headers.CacheControl = "no-store";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            var origin = context.Request.Headers.Origin.ToString();
            var isWriteRequest = HttpMethods.IsPost(context.Request.Method)
                || HttpMethods.IsPut(context.Request.Method)
                || HttpMethods.IsPatch(context.Request.Method)
                || HttpMethods.IsDelete(context.Request.Method);
            if (isWriteRequest && string.IsNullOrEmpty(origin))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }
            if (!string.IsNullOrEmpty(origin))
            {
                if (!origin.Equals(AgentOptions.AllowedBrowserOrigin, StringComparison.Ordinal))
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return;
                }
                context.Response.Headers.AccessControlAllowOrigin = AgentOptions.AllowedBrowserOrigin;
                context.Response.Headers.AccessControlAllowMethods = "GET, POST, OPTIONS";
                context.Response.Headers.AccessControlAllowHeaders = "Content-Type";
                context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
                context.Response.Headers.Vary = "Origin";
            }

            if (HttpMethods.IsOptions(context.Request.Method))
            {
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }
            await next();
        });

        app.MapGet("/health", () => Results.Json(new
        {
            status = "ok",
            environment = AgentOptions.EnvironmentName,
            version = AgentOptions.Version,
            device_id = _identity.DeviceId,
            listen_url = AgentOptions.ListenUrl,
        }));

        app.MapPost("/v1/sign", async (HttpRequest httpRequest) =>
        {
            var request = await httpRequest.ReadFromJsonAsync<StartSigningRequest>(cancellationToken: cancellationToken);
            string? error = null;
            if (request is null || !_coordinator.TryEnqueue(request, out error))
            {
                return Results.BadRequest(new { detail = error ?? "Solicitação inválida." });
            }
            await _dispatcher.InvokeAsync(() =>
            {
                if (Application.Current.MainWindow is { } window)
                {
                    window.Show();
                    window.WindowState = WindowState.Normal;
                    window.Activate();
                }
            });
            return Results.Accepted(value: new { status = "accepted", session_id = request.SessionId });
        });

        app.MapPost("/v1/pair", async (PairAgentRequest request) =>
        {
            if (!AgentOptions.IsAllowedBackend(request.BackendBaseUrl)
                || request.ExpiresAt <= DateTimeOffset.UtcNow
                || request.PairingId == Guid.Empty)
            {
                return Results.BadRequest(new { detail = "Pareamento inválido ou expirado." });
            }

            var accepted = await _dispatcher.InvokeAsync(() => MessageBox.Show(
                $"Confirma o pareamento do dispositivo com o ambiente de HOMOLOGAÇÃO?\n\nCódigo: {request.PairingCode}",
                "Parear FrotaSigner-HML",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question) == MessageBoxResult.Yes);
            if (!accepted)
            {
                return Results.StatusCode(StatusCodes.Status409Conflict);
            }
            await _backend.PairAsync(request, cancellationToken);
            return Results.Ok(new { status = "paired", device_id = _identity.DeviceId });
        });

        _application = app;
        await app.StartAsync(cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        if (_application is not null)
        {
            await _application.StopAsync(TimeSpan.FromSeconds(5));
            await _application.DisposeAsync();
        }
    }
}

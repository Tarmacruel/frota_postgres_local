using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;

namespace FrotaSigner.Hml;

public sealed class BackendClient : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly DeviceIdentityStore _identity;
    private readonly HttpClient _http;

    public BackendClient(DeviceIdentityStore identity)
    {
        _identity = identity;
        _http = new HttpClient(new SocketsHttpHandler
        {
            AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate,
            UseCookies = false,
        })
        {
            Timeout = TimeSpan.FromSeconds(30),
        };
    }

    public async Task PairAsync(PairAgentRequest request, CancellationToken cancellationToken)
    {
        ValidateBackend(request.BackendBaseUrl);
        if (request.ExpiresAt <= DateTimeOffset.UtcNow || request.PairingCode.Length is < 6 or > 12)
        {
            throw new InvalidOperationException("Pareamento inválido ou expirado.");
        }

        var path = $"/api/document-signatures/agent/pairings/{request.PairingId:D}/complete";
        var body = new PairingCompletion(
            request.PairingCode,
            _identity.DeviceId,
            _identity.PublicKey,
            AgentOptions.EnvironmentName);
        await SendJsonAsync<object>(request.BackendBaseUrl, HttpMethod.Post, path, body, null, cancellationToken);
    }

    internal async Task<ClaimResponse> ClaimAsync(
        StartSigningRequest request,
        X509Certificate2 certificate,
        CertificateService certificateService,
        CancellationToken cancellationToken)
    {
        ValidateBackend(request.BackendBaseUrl);
        if (request.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            throw new InvalidOperationException("A sessão de assinatura expirou.");
        }

        var sessionPath = $"/api/document-signatures/certificate-sessions/{request.SessionId:D}";
        var claim = new CertificateClaim(
            Convert.ToBase64String(certificate.RawData),
            certificateService.BuildPublicChain(certificate),
            certificateService.SupportedAlgorithms(certificate),
            _identity.DeviceId);
        var claimed = await SendJsonAsync<ClaimResponse>(
            request.BackendBaseUrl,
            HttpMethod.Post,
            sessionPath + "/claim",
            claim,
            request.OneTimeToken,
            cancellationToken);

        if (claimed.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            throw new InvalidOperationException("O backend expirou a sessão antes da assinatura.");
        }
        if (string.IsNullOrWhiteSpace(claimed.CompletionToken)
            || claimed.CompletionToken.Length < 32)
        {
            throw new InvalidOperationException("O backend não forneceu token de conclusão válido.");
        }
        ValidateAuthoritativeClaim(claimed);
        return claimed;
    }

    internal static void ValidateAuthoritativeClaim(ClaimResponse claimed)
    {
        if (!string.Equals(claimed.Environment, AgentOptions.EnvironmentName, StringComparison.Ordinal)
            || string.IsNullOrWhiteSpace(claimed.DocumentTitle)
            || claimed.DocumentTitle.Length > 240
            || string.IsNullOrWhiteSpace(claimed.DocumentType)
            || claimed.DocumentType.Length > 80
            || claimed.ContentHash.Length != 64
            || !claimed.ContentHash.All(Uri.IsHexDigit))
        {
            throw new InvalidOperationException(
                "O backend não confirmou metadados autoritativos de homologação.");
        }
    }

    internal async Task<CompleteSignatureResponse> CompleteAsync(
        StartSigningRequest request,
        X509Certificate2 certificate,
        CertificateService certificateService,
        ClaimResponse claimed,
        CancellationToken cancellationToken)
    {
        var sessionPath = $"/api/document-signatures/certificate-sessions/{request.SessionId:D}";
        var toBeSigned = Convert.FromBase64String(claimed.ToBeSigned);
        var rawSignature = certificateService.Sign(certificate, toBeSigned, claimed.SignatureAlgorithm);
        try
        {
            var completion = new CompleteSignatureRequest(
                Convert.ToBase64String(rawSignature),
                claimed.SignatureAlgorithm,
                _identity.DeviceId);
            return await SendJsonAsync<CompleteSignatureResponse>(
                request.BackendBaseUrl,
                HttpMethod.Post,
                sessionPath + "/complete",
                completion,
                claimed.CompletionToken,
                cancellationToken);
        }
        finally
        {
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(toBeSigned);
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(rawSignature);
        }
    }

    private async Task<T> SendJsonAsync<T>(
        string baseUrl,
        HttpMethod method,
        string path,
        object body,
        string? signingToken,
        CancellationToken cancellationToken)
    {
        ValidateBackend(baseUrl);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(body, JsonOptions);
        using var message = new HttpRequestMessage(method, new Uri(new Uri(baseUrl), path))
        {
            Content = new ByteArrayContent(bytes),
        };
        message.Content.Headers.ContentType = new("application/json");
        if (signingToken is not null)
        {
            message.Headers.TryAddWithoutValidation("X-Frota-Signing-Token", signingToken);
        }
        var proof = _identity.CreateRequestProof(method, path, bytes);
        message.Headers.TryAddWithoutValidation("X-Frota-Device-Id", _identity.DeviceId);
        message.Headers.TryAddWithoutValidation("X-Frota-Device-Timestamp", proof.Timestamp);
        message.Headers.TryAddWithoutValidation("X-Frota-Device-Nonce", proof.Nonce);
        message.Headers.TryAddWithoutValidation("X-Frota-Device-Proof", proof.Proof);

        using var response = await _http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"O backend recusou a operação ({(int)response.StatusCode}).");
        }
        if (typeof(T) == typeof(object) || response.StatusCode == HttpStatusCode.NoContent)
        {
            return default!;
        }
        var result = await response.Content.ReadFromJsonAsync<T>(JsonOptions, cancellationToken);
        return result ?? throw new InvalidOperationException("O backend retornou resposta vazia.");
    }

    private static void ValidateBackend(string value)
    {
        if (!AgentOptions.IsAllowedBackend(value))
        {
            throw new InvalidOperationException("Origem do backend não autorizada para o agente HML.");
        }
    }

    public void Dispose() => _http.Dispose();
}

using System.Windows;

namespace FrotaSigner.Hml;

public partial class App : Application
{
    private readonly CancellationTokenSource _shutdown = new();
    private LocalAgentServer? _server;
    private BackendClient? _backend;
    private DeviceIdentityStore? _identity;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            _identity = DeviceIdentityStore.LoadOrCreate();
            var coordinator = new SigningCoordinator();
            var certificates = new CertificateService();
            _backend = new BackendClient(_identity);
            var window = new MainWindow(coordinator, certificates, _backend, _identity, _shutdown);
            MainWindow = window;

            _server = new LocalAgentServer(coordinator, _backend, _identity, Dispatcher);
            await _server.StartAsync(_shutdown.Token);
            window.Show();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Não foi possível iniciar o agente de homologação.\n\n{ex.Message}",
                "FrotaSigner-HML",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Shutdown(1);
        }
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        _shutdown.Cancel();
        if (_server is not null)
        {
            await _server.DisposeAsync();
        }
        _backend?.Dispose();
        _identity?.Dispose();
        _shutdown.Dispose();
        base.OnExit(e);
    }
}

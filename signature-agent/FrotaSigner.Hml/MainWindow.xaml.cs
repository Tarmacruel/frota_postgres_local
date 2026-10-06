using System.Security.Cryptography.X509Certificates;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Win32;

namespace FrotaSigner.Hml;

public partial class MainWindow : Window
{
    private readonly SigningCoordinator _coordinator;
    private readonly CertificateService _certificates;
    private readonly BackendClient _backend;
    private readonly CancellationTokenSource _shutdown;
    private readonly DispatcherTimer _idleTimer;
    private SigningJob? _current;
    private bool _busy;

    public MainWindow(
        SigningCoordinator coordinator,
        CertificateService certificates,
        BackendClient backend,
        DeviceIdentityStore identity,
        CancellationTokenSource shutdown)
    {
        InitializeComponent();
        _coordinator = coordinator;
        _certificates = certificates;
        _backend = backend;
        _shutdown = shutdown;
        DeviceIdText.Text = identity.DeviceId;
        RefreshCertificates();

        _idleTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        _idleTimer.Tick += (_, _) => CheckInactivity();
        _idleTimer.Start();
        Loaded += async (_, _) => await ReadJobsAsync(_shutdown.Token);
    }

    private async Task ReadJobsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var job in _coordinator.Jobs.ReadAllAsync(cancellationToken))
            {
                while (_current is not null && !cancellationToken.IsCancellationRequested)
                {
                    await Task.Delay(250, cancellationToken);
                }
                await Dispatcher.InvokeAsync(() => ShowJob(job));
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private void ShowJob(SigningJob job)
    {
        _current = job;
        _coordinator.Touch();
        EmptyStateText.Visibility = Visibility.Collapsed;
        RequestPanel.Visibility = Visibility.Visible;
        DocumentTitleText.Text = "Solicitação recebida";
        DocumentTypeText.Text = "Os dados do documento ainda não foram confirmados.";
        DocumentHashText.Text = "Selecione um certificado para o backend validar a sessão.";
        StatusText.Text = "Nenhum dado enviado pelo navegador será usado no consentimento.";
        RefreshCertificates();
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    private void RefreshCertificates()
    {
        var items = _certificates.ListStoreCertificates();
        CertificateCombo.ItemsSource = items;
        CertificateCombo.SelectedIndex = items.Count > 0 ? 0 : -1;
        SignStoreButton.IsEnabled = items.Count > 0;
    }

    private async void SignStoreButton_Click(object sender, RoutedEventArgs e)
    {
        if (_current is null || CertificateCombo.SelectedItem is not CertificateDescriptor descriptor)
        {
            return;
        }
        using var certificate = _certificates.LoadFromStore(descriptor.Thumbprint);
        await SignCurrentAsync(certificate);
    }

    private async void SelectPfxButton_Click(object sender, RoutedEventArgs e)
    {
        if (_current is null)
        {
            return;
        }
        var picker = new OpenFileDialog
        {
            Filter = "Certificados PKCS#12 (*.pfx;*.p12)|*.pfx;*.p12",
            CheckFileExists = true,
            Multiselect = false,
            Title = "Selecione o certificado A1",
        };
        if (picker.ShowDialog(this) != true)
        {
            return;
        }

        var passwordWindow = new PasswordPromptWindow { Owner = this };
        if (passwordWindow.ShowDialog() != true)
        {
            return;
        }
        try
        {
            using var certificate = _certificates.LoadPfxEphemeral(
                picker.FileName,
                passwordWindow.CertificatePassword);
            await SignCurrentAsync(certificate);
        }
        finally
        {
            passwordWindow.ClearPassword();
        }
    }

    private async Task SignCurrentAsync(X509Certificate2 certificate)
    {
        if (_current is null || _busy)
        {
            return;
        }
        _busy = true;
        SetButtons(false);
        StatusText.Text = "Validando certificado, identidade e documento no backend...";
        _coordinator.Touch();
        try
        {
            var claimed = await _backend.ClaimAsync(
                _current.Request,
                certificate,
                _certificates,
                _shutdown.Token);
            DocumentTitleText.Text = claimed.DocumentTitle;
            DocumentTypeText.Text = $"Tipo: {claimed.DocumentType}";
            DocumentHashText.Text = $"SHA-256: {claimed.ContentHash}";
            StatusText.Text = "Dados confirmados pelo backend. Aguarde seu consentimento.";
            if (MessageBox.Show(
                    $"Confirma a assinatura em {claimed.Environment}?\n\n{claimed.DocumentTitle}\nTipo: {claimed.DocumentType}\nSHA-256: {claimed.ContentHash}",
                    "Confirmar assinatura",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning) != MessageBoxResult.Yes)
            {
                StatusText.Text = "Assinatura recusada. Nenhuma operação criptográfica foi executada.";
                CompleteCurrent();
                return;
            }
            StatusText.Text = "Consentimento confirmado; assinando e finalizando...";
            var result = await _backend.CompleteAsync(
                _current.Request,
                certificate,
                _certificates,
                claimed,
                _shutdown.Token);
            StatusText.Text = result.Status == "COMPLETED"
                ? $"Assinatura concluída. Artefato: {result.ArtifactSha256 ?? "hash pendente"}."
                : $"Backend retornou o estado {result.Status}.";
            CompleteCurrent();
        }
        catch (Exception ex)
        {
            StatusText.Text = $"Não foi possível assinar: {ex.Message}";
        }
        finally
        {
            _busy = false;
            SetButtons(true);
        }
    }

    private void RejectButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy)
        {
            return;
        }
        StatusText.Text = "Solicitação recusada localmente. Ela expirará ou poderá ser cancelada no sistema.";
        CompleteCurrent();
    }

    private void CompleteCurrent()
    {
        _current = null;
        RequestPanel.Visibility = Visibility.Collapsed;
        EmptyStateText.Visibility = Visibility.Visible;
        _coordinator.Touch();
    }

    private void SetButtons(bool enabled)
    {
        RequestPanel.IsEnabled = enabled;
    }

    private void CheckInactivity()
    {
        var remaining = AgentOptions.InactivityTimeout - (DateTimeOffset.UtcNow - _coordinator.LastActivityUtc);
        IdleText.Text = remaining > TimeSpan.Zero
            ? $"Encerramento automático por inatividade em {Math.Ceiling(remaining.TotalMinutes)} min"
            : "Encerrando por inatividade...";
        if (remaining <= TimeSpan.Zero && !_busy && _current is null)
        {
            _shutdown.Cancel();
            Application.Current.Shutdown();
        }
    }
}

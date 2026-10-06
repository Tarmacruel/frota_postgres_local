using System.Windows;

namespace FrotaSigner.Hml;

public partial class PasswordPromptWindow : Window
{
    public PasswordPromptWindow() => InitializeComponent();

    public string CertificatePassword => PasswordInput.Password;

    public void ClearPassword() => PasswordInput.Clear();

    private void Continue_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        PasswordInput.Clear();
        DialogResult = false;
        Close();
    }
}

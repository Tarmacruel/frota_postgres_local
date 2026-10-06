namespace FrotaSigner.Hml;

internal static class AgentOptions
{
    public const string EnvironmentName = "HOMOLOGACAO";
    public const string Version = "0.1.0-hml";
    public const string ListenUrl = "http://127.0.0.1:54174";
    public const string AllowedBrowserOrigin = "http://127.0.0.1:3010";
    public const string AllowedBackendOrigin = "http://127.0.0.1:8010";
    public static readonly TimeSpan SessionTimeout = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan InactivityTimeout = TimeSpan.FromMinutes(15);
    public const int MaxRequestBytes = 64 * 1024;

    public static bool IsAllowedBackend(string value)
    {
        return Uri.TryCreate(value, UriKind.Absolute, out var uri)
            && uri.GetLeftPart(UriPartial.Authority).Equals(AllowedBackendOrigin, StringComparison.Ordinal)
            && uri.AbsolutePath == "/"
            && string.IsNullOrEmpty(uri.Query)
            && string.IsNullOrEmpty(uri.Fragment);
    }
}

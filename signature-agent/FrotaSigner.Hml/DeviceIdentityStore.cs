using System.Security.Cryptography;
using System.Net.Http;
using System.IO;

namespace FrotaSigner.Hml;

public sealed class DeviceIdentityStore : IDisposable
{
    private static readonly byte[] Entropy = "FrotaSigner-HML/device-key/v1"u8.ToArray();
    private readonly RSA _key;

    private DeviceIdentityStore(RSA key)
    {
        _key = key;
        PublicKey = Convert.ToBase64String(_key.ExportSubjectPublicKeyInfo());
        DeviceId = Convert.ToHexString(SHA256.HashData(_key.ExportSubjectPublicKeyInfo())).ToLowerInvariant();
    }

    public string DeviceId { get; }
    public string PublicKey { get; }

    public static DeviceIdentityStore LoadOrCreate()
    {
        var root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FrotaSigner-HML");
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "device-key.dpapi");
        var rsa = RSA.Create(3072);

        if (File.Exists(path))
        {
            var protectedBytes = File.ReadAllBytes(path);
            var privateBytes = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.CurrentUser);
            try
            {
                rsa.ImportPkcs8PrivateKey(privateBytes, out _);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(privateBytes);
            }
        }
        else
        {
            var privateBytes = rsa.ExportPkcs8PrivateKey();
            try
            {
                var protectedBytes = ProtectedData.Protect(privateBytes, Entropy, DataProtectionScope.CurrentUser);
                File.WriteAllBytes(path, protectedBytes);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(privateBytes);
            }
        }

        return new DeviceIdentityStore(rsa);
    }

    public (string Timestamp, string Nonce, string Proof) CreateRequestProof(
        HttpMethod method,
        string path,
        ReadOnlySpan<byte> body)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var bodyHash = Convert.ToHexString(SHA256.HashData(body)).ToLowerInvariant();
        var canonical = System.Text.Encoding.UTF8.GetBytes(
            $"{timestamp}\n{nonce}\n{method.Method.ToUpperInvariant()}\n{path}\n{bodyHash}");
        var signature = _key.SignData(canonical, HashAlgorithmName.SHA256, RSASignaturePadding.Pss);
        return (timestamp, nonce, Convert.ToBase64String(signature));
    }

    public void Dispose() => _key.Dispose();
}

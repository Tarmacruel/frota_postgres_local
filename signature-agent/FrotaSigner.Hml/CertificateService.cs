using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.IO;

namespace FrotaSigner.Hml;

public sealed class CertificateService
{
    public IReadOnlyList<CertificateDescriptor> ListStoreCertificates()
    {
        using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
        store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
        return store.Certificates
            .OfType<X509Certificate2>()
            .Where(IsSigningCertificate)
            .OrderByDescending(certificate => certificate.NotAfter)
            .Select(ToDescriptor)
            .ToArray();
    }

    public X509Certificate2 LoadFromStore(string thumbprint)
    {
        using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
        store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
        var normalized = NormalizeThumbprint(thumbprint);
        var match = store.Certificates
            .OfType<X509Certificate2>()
            .FirstOrDefault(certificate => NormalizeThumbprint(certificate.Thumbprint) == normalized);
        if (match is null || !IsSigningCertificate(match))
        {
            throw new InvalidOperationException("Certificado não encontrado ou sem chave privada de assinatura.");
        }
        return new X509Certificate2(match);
    }

    public X509Certificate2 LoadPfxEphemeral(string path, string password)
    {
        if (!File.Exists(path) || !new[] { ".pfx", ".p12" }.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Selecione um arquivo .pfx ou .p12 válido.");
        }
        var payload = File.ReadAllBytes(path);
        try
        {
            var certificate = X509CertificateLoader.LoadPkcs12(
                payload,
                password,
                X509KeyStorageFlags.EphemeralKeySet);
            if (!IsSigningCertificate(certificate))
            {
                certificate.Dispose();
                throw new InvalidOperationException("O arquivo não contém certificado com chave privada para assinatura.");
            }
            return certificate;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(payload);
        }
    }

    public IReadOnlyList<string> BuildPublicChain(X509Certificate2 certificate)
    {
        using var chain = new X509Chain();
        chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
        chain.ChainPolicy.VerificationFlags = X509VerificationFlags.AllowUnknownCertificateAuthority;
        chain.Build(certificate);
        return chain.ChainElements
            .OfType<X509ChainElement>()
            .Skip(1)
            .Select(element => Convert.ToBase64String(element.Certificate.RawData))
            .ToArray();
    }

    public IReadOnlyList<string> SupportedAlgorithms(X509Certificate2 certificate)
    {
        if (certificate.GetRSAPublicKey() is not null)
        {
            return ["PS256", "RS256"];
        }
        if (certificate.GetECDsaPublicKey() is not null)
        {
            return ["ES256", "ES384", "ES512"];
        }
        return [];
    }

    public byte[] Sign(X509Certificate2 certificate, ReadOnlySpan<byte> payload, string algorithm)
    {
        if (algorithm is "RS256" or "PS256")
        {
            using var rsa = certificate.GetRSAPrivateKey()
                ?? throw new InvalidOperationException("A chave privada RSA não está disponível.");
            return rsa.SignData(
                payload,
                HashAlgorithmName.SHA256,
                algorithm == "PS256" ? RSASignaturePadding.Pss : RSASignaturePadding.Pkcs1);
        }

        if (algorithm is "ES256" or "ES384" or "ES512")
        {
            using var ecdsa = certificate.GetECDsaPrivateKey()
                ?? throw new InvalidOperationException("A chave privada ECDSA não está disponível.");
            var hash = algorithm switch
            {
                "ES256" => HashAlgorithmName.SHA256,
                "ES384" => HashAlgorithmName.SHA384,
                _ => HashAlgorithmName.SHA512,
            };
            return ecdsa.SignData(payload, hash, DSASignatureFormat.Rfc3279DerSequence);
        }

        throw new InvalidOperationException("Algoritmo de assinatura não permitido pelo agente.");
    }

    private static bool IsSigningCertificate(X509Certificate2 certificate)
    {
        if (!certificate.HasPrivateKey || certificate.NotAfter.ToUniversalTime() <= DateTime.UtcNow)
        {
            return false;
        }
        var usages = certificate.Extensions.OfType<X509KeyUsageExtension>().ToArray();
        return usages.Length == 0 || usages.Any(extension =>
            extension.KeyUsages.HasFlag(X509KeyUsageFlags.DigitalSignature)
            || extension.KeyUsages.HasFlag(X509KeyUsageFlags.NonRepudiation));
    }

    private static CertificateDescriptor ToDescriptor(X509Certificate2 certificate)
    {
        var displayName = certificate.GetNameInfo(X509NameType.SimpleName, false);
        var issuerName = certificate.GetNameInfo(X509NameType.SimpleName, true);
        var algorithm = certificate.GetRSAPublicKey() is not null ? "RSA" : "ECDSA";
        return new CertificateDescriptor(
            NormalizeThumbprint(certificate.Thumbprint),
            string.IsNullOrWhiteSpace(displayName) ? "Certificado sem nome" : displayName,
            string.IsNullOrWhiteSpace(issuerName) ? "Emissor não informado" : issuerName,
            certificate.NotBefore,
            certificate.NotAfter,
            algorithm);
    }

    private static string NormalizeThumbprint(string value) =>
        new(value.Where(Uri.IsHexDigit).Select(char.ToUpperInvariant).ToArray());
}

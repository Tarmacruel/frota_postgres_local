using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using Xunit;

namespace FrotaSigner.Hml.Tests;

public sealed class SigningCoordinatorTests
{
    [Fact]
    public void Accepts_valid_session_once()
    {
        var coordinator = new SigningCoordinator();
        var request = ValidRequest();

        Assert.True(coordinator.TryEnqueue(request, out var firstError));
        Assert.Null(firstError);
        Assert.False(coordinator.TryEnqueue(request, out var secondError));
        Assert.Contains("já foi", secondError, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("http://127.0.0.1:8000/")]
    [InlineData("https://127.0.0.1:8010/")]
    [InlineData("http://localhost:8010/")]
    public void Rejects_untrusted_backend(string backend)
    {
        var coordinator = new SigningCoordinator();
        var request = ValidRequest() with { BackendBaseUrl = backend };

        Assert.False(coordinator.TryEnqueue(request, out var error));
        Assert.NotNull(error);
    }

    [Fact]
    public void Rejects_expired_session()
    {
        var coordinator = new SigningCoordinator();
        var request = ValidRequest() with { ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(-1) };

        Assert.False(coordinator.TryEnqueue(request, out _));
    }

    [Fact]
    public void Browser_document_metadata_is_not_trusted_before_claim()
    {
        var coordinator = new SigningCoordinator();
        var request = ValidRequest() with
        {
            DocumentTitle = "",
            DocumentType = "conteúdo controlado pelo navegador",
            ContentHash = "não confiável",
        };

        Assert.True(coordinator.TryEnqueue(request, out var error));
        Assert.Null(error);
    }

    [Fact]
    public void Rejects_non_homologation_authoritative_claim()
    {
        var claimed = new ClaimResponse(
            Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            "RS256",
            Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
            DateTimeOffset.UtcNow.AddMinutes(4),
            "Documento controlado pelo backend",
            "POSSESSION_RESPONSIBILITY_TERM",
            new string('a', 64),
            "PRODUÇÃO");

        Assert.Throws<InvalidOperationException>(
            () => BackendClient.ValidateAuthoritativeClaim(claimed));
    }

    [Fact]
    public void Signs_with_ephemeral_rsa_certificate()
    {
        using var rsa = RSA.Create(2048);
        var certificateRequest = new CertificateRequest(
            "CN=Frota HML Test",
            rsa,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
        certificateRequest.CertificateExtensions.Add(
            new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, true));
        using var certificate = certificateRequest.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddMinutes(-1),
            DateTimeOffset.UtcNow.AddDays(1));
        var service = new CertificateService();
        var payload = Encoding.UTF8.GetBytes("atributos CMS de teste");

        var signature = service.Sign(certificate, payload, "PS256");

        Assert.True(rsa.VerifyData(payload, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pss));
        Assert.Contains("PS256", service.SupportedAlgorithms(certificate));
    }

    [Fact]
    public void Signs_with_ephemeral_ecdsa_certificate()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var certificateRequest = new CertificateRequest(
            "CN=Frota HML ECDSA Test",
            ecdsa,
            HashAlgorithmName.SHA256);
        certificateRequest.CertificateExtensions.Add(
            new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, true));
        using var certificate = certificateRequest.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddMinutes(-1),
            DateTimeOffset.UtcNow.AddDays(1));
        var service = new CertificateService();
        var payload = Encoding.UTF8.GetBytes("atributos CMS ECDSA de teste");

        var signature = service.Sign(certificate, payload, "ES256");

        Assert.True(ecdsa.VerifyData(
            payload,
            signature,
            HashAlgorithmName.SHA256,
            DSASignatureFormat.Rfc3279DerSequence));
        Assert.Contains("ES256", service.SupportedAlgorithms(certificate));
    }

    [Fact]
    public void Loads_pfx_with_ephemeral_private_key()
    {
        var temporaryRoot = Path.Combine(Path.GetTempPath(), $"frota-signer-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(temporaryRoot);
        var pfxPath = Path.Combine(temporaryRoot, "certificate.pfx");
        const string password = "Hml-test-only-42!";
        try
        {
            using var rsa = RSA.Create(2048);
            var certificateRequest = new CertificateRequest(
                "CN=Frota HML PFX Test",
                rsa,
                HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1);
            certificateRequest.CertificateExtensions.Add(
                new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, true));
            using var source = certificateRequest.CreateSelfSigned(
                DateTimeOffset.UtcNow.AddMinutes(-1),
                DateTimeOffset.UtcNow.AddDays(1));
            File.WriteAllBytes(pfxPath, source.Export(X509ContentType.Pfx, password));
            var service = new CertificateService();

            using var loaded = service.LoadPfxEphemeral(pfxPath, password);
            var payload = Encoding.UTF8.GetBytes("PFX efêmero");
            var signature = service.Sign(loaded, payload, "RS256");

            Assert.True(rsa.VerifyData(
                payload,
                signature,
                HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1));
        }
        finally
        {
            if (Directory.Exists(temporaryRoot))
            {
                Directory.Delete(temporaryRoot, recursive: true);
            }
        }
    }

    private static StartSigningRequest ValidRequest() => new(
        Guid.NewGuid(),
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
        "http://127.0.0.1:8010/",
        "Termo sintético de homologação",
        "POSSESSION_RESPONSIBILITY_TERM",
        new string('a', 64),
        DateTimeOffset.UtcNow.AddMinutes(4));
}

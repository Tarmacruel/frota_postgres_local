using System.Text.Json.Serialization;

namespace FrotaSigner.Hml;

public sealed record StartSigningRequest(
    [property: JsonPropertyName("session_id")] Guid SessionId,
    [property: JsonPropertyName("one_time_token")] string OneTimeToken,
    [property: JsonPropertyName("backend_base_url")] string BackendBaseUrl,
    [property: JsonPropertyName("document_title")] string DocumentTitle,
    [property: JsonPropertyName("document_type")] string DocumentType,
    [property: JsonPropertyName("content_hash")] string ContentHash,
    [property: JsonPropertyName("expires_at")] DateTimeOffset ExpiresAt);

public sealed record PairAgentRequest(
    [property: JsonPropertyName("pairing_id")] Guid PairingId,
    [property: JsonPropertyName("pairing_code")] string PairingCode,
    [property: JsonPropertyName("backend_base_url")] string BackendBaseUrl,
    [property: JsonPropertyName("expires_at")] DateTimeOffset ExpiresAt);

public sealed record CertificateDescriptor(
    string Thumbprint,
    string DisplayName,
    string IssuerName,
    DateTimeOffset NotBefore,
    DateTimeOffset NotAfter,
    string Algorithm)
{
    public string Summary => $"{DisplayName} — {IssuerName} — válido até {NotAfter:dd/MM/yyyy}";
}

internal sealed record CertificateClaim(
    [property: JsonPropertyName("certificate_der")] string CertificateDer,
    [property: JsonPropertyName("certificate_chain")] IReadOnlyList<string> CertificateChain,
    [property: JsonPropertyName("supported_algorithms")] IReadOnlyList<string> SupportedAlgorithms,
    [property: JsonPropertyName("device_id")] string DeviceId);

internal sealed record ClaimResponse(
    [property: JsonPropertyName("to_be_signed")] string ToBeSigned,
    [property: JsonPropertyName("signature_algorithm")] string SignatureAlgorithm,
    [property: JsonPropertyName("completion_token")] string CompletionToken,
    [property: JsonPropertyName("expires_at")] DateTimeOffset ExpiresAt,
    [property: JsonPropertyName("document_title")] string DocumentTitle,
    [property: JsonPropertyName("document_type")] string DocumentType,
    [property: JsonPropertyName("content_hash")] string ContentHash,
    [property: JsonPropertyName("environment")] string Environment);

internal sealed record CompleteSignatureRequest(
    [property: JsonPropertyName("raw_signature")] string RawSignature,
    [property: JsonPropertyName("signature_algorithm")] string SignatureAlgorithm,
    [property: JsonPropertyName("device_id")] string DeviceId);

internal sealed record CompleteSignatureResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("artifact_sha256")] string? ArtifactSha256);

internal sealed record PairingCompletion(
    [property: JsonPropertyName("pairing_code")] string PairingCode,
    [property: JsonPropertyName("device_id")] string DeviceId,
    [property: JsonPropertyName("device_public_key")] string DevicePublicKey,
    [property: JsonPropertyName("environment")] string Environment);

internal abstract record AgentJob;
internal sealed record SigningJob(StartSigningRequest Request) : AgentJob;

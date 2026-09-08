using System.Collections.Concurrent;
using System.Threading.Channels;

namespace FrotaSigner.Hml;

public sealed class SigningCoordinator
{
    private readonly Channel<SigningJob> _jobs = Channel.CreateBounded<SigningJob>(
        new BoundedChannelOptions(4) { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true });
    private readonly ConcurrentDictionary<Guid, DateTimeOffset> _accepted = new();
    private long _lastActivityTicks = DateTimeOffset.UtcNow.UtcTicks;

    internal ChannelReader<SigningJob> Jobs => _jobs.Reader;
    public DateTimeOffset LastActivityUtc => new(Interlocked.Read(ref _lastActivityTicks), TimeSpan.Zero);

    public bool TryEnqueue(StartSigningRequest request, out string? error)
    {
        Touch();
        CleanupExpiredEntries();

        if (request.SessionId == Guid.Empty
            || string.IsNullOrWhiteSpace(request.OneTimeToken)
            || request.OneTimeToken.Length < 32
            || request.ExpiresAt <= DateTimeOffset.UtcNow
            || request.ExpiresAt > DateTimeOffset.UtcNow.Add(AgentOptions.SessionTimeout).AddSeconds(30)
            || !AgentOptions.IsAllowedBackend(request.BackendBaseUrl))
        {
            error = "Solicitação inválida ou expirada.";
            return false;
        }

        if (!_accepted.TryAdd(request.SessionId, request.ExpiresAt))
        {
            error = "Esta sessão já foi encaminhada ao agente.";
            return false;
        }

        if (!_jobs.Writer.TryWrite(new SigningJob(request)))
        {
            _accepted.TryRemove(request.SessionId, out _);
            error = "O agente já possui solicitações pendentes.";
            return false;
        }

        error = null;
        return true;
    }

    public void Touch() => Interlocked.Exchange(ref _lastActivityTicks, DateTimeOffset.UtcNow.UtcTicks);

    private void CleanupExpiredEntries()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in _accepted)
        {
            if (entry.Value <= now)
            {
                _accepted.TryRemove(entry.Key, out _);
            }
        }
    }
}

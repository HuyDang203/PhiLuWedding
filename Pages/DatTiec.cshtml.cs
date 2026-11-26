using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PhiluWedding.Data;
using PhiluWedding.Domain.Entities;
using PhiluWedding.Services;

namespace PhiluWedding.Pages.DatTiec;

/// <summary>
/// The public wedding-consultation page (<c>/dat-tiec</c>).
///
/// <para>
/// The page is a consultation landing page, not a form: it invites the
/// visitor to reach the restaurant directly — a click-to-call hotline
/// and a Zalo chat — and explains what the consultation covers and how
/// it runs. There is no submission workflow on this page any more.
/// </para>
///
/// <para>
/// The page never touches the database for its content. Every phone
/// number and social link comes from the <c>Brand:Contact</c>
/// configuration through <see cref="BrandContact"/> — the same helper the
/// floating bubbles and the <c>/lien-he</c> page use — and the two
/// venue addresses come from <see cref="VenueContactCatalog"/>. The page
/// therefore always renders, even when PostgreSQL is unavailable.
/// </para>
///
/// <para>
/// The only database access is the optional hall context: a visitor who
/// arrives from a hall page with <c>?hallId=</c> sees which hall they
/// were looking at. The lookup is best-effort and never blocks the page.
/// </para>
/// </summary>
public class DatTiecModel : PageModel
{
    private readonly PhiluWeddingDbContext? _db;
    private readonly ILogger<DatTiecModel> _logger;

    public DatTiecModel(
        ILogger<DatTiecModel> logger,
        IConfiguration configuration,
        PhiluWeddingDbContext? db = null)
    {
        // DbContext is optional: Program.cs only registers it when a
        // connection string is configured.
        _db = db;
        _logger = logger;
        Contact = BrandContact.Resolve(configuration);
    }

    /// <summary>The official contact channels (hotline, Facebook, Zalo).</summary>
    public BrandContactInfo Contact { get; }

    /// <summary>The two venues with their confirmed addresses and map links.</summary>
    public IReadOnlyList<VenueContact> Venues => VenueContactCatalog.Venues;

    /// <summary>
    /// The hall the visitor was looking at when they followed a
    /// <c>?hallId=</c> link. It is shown as context only; the page does
    /// not require it and never stores it.
    /// </summary>
    public WeddingHall? PreferredHall { get; private set; }

    public async Task OnGetAsync(int? hallId = null)
    {
        await ResolvePreferredHallAsync(hallId);

        _logger.LogInformation("Consultation page requested.");
    }

    /// <summary>
    /// Resolves the hall context for display. The id may arrive from the
    /// URL; it is silently dropped when the hall is missing or
    /// unpublished, and a database outage never blocks the page.
    /// </summary>
    private async Task ResolvePreferredHallAsync(int? hallId)
    {
        if (!hallId.HasValue || _db is null)
        {
            return;
        }

        try
        {
            PreferredHall = await _db.WeddingHalls
                .AsNoTracking()
                .Where(h => h.Id == hallId.Value && h.IsPublished)
                .FirstOrDefaultAsync();
        }
        catch (Exception ex)
        {
            // Treat lookup failures as "no preselection" — never let
            // a database outage block the page from rendering.
            // Log only the message; the hosting platform captures the
            // full stack via its own sink.
            _logger.LogWarning(
                "DatTiec: preferred hall lookup failed for id={Id}. {Message}",
                hallId,
                ex.Message);
        }
    }
}

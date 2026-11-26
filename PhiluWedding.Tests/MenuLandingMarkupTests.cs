using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using PhiluWedding.Data;
using PhiluWedding.Services;
using Xunit;

namespace PhiluWedding.Tests;

/// <summary>
/// Integration tests for the public menu landing page
/// (<c>/thuc-don</c>). They check the price-tier cards: the tier cards
/// carry only the individual option buttons (Phương án A/B/C) and no
/// longer the "Xem mức giá này" button.
/// </summary>
public class MenuLandingMarkupTests : IClassFixture<MenuLandingWebApplicationFactory>
{
    private readonly MenuLandingWebApplicationFactory _factory;
    private readonly Task _seeded;

    public MenuLandingMarkupTests(MenuLandingWebApplicationFactory factory)
    {
        _factory = factory;
        _seeded = factory.SeedAsync();
    }

    private async Task<string> GetPageAsync(string url)
    {
        await _seeded;

        var client = _factory.CreateClient();
        var html = await client.GetStringAsync(url);
        return WebUtility.HtmlDecode(html);
    }

    [Fact]
    public async Task The_menu_landing_page_is_served()
    {
        await _seeded;

        var client = _factory.CreateClient();

        var response = await client.GetAsync("/thuc-don");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task The_tier_cards_have_no_price_button()
    {
        var html = await GetPageAsync("/thuc-don");

        // The "Xem mức giá này" button is gone from the tier cards.
        Assert.DoesNotContain("Xem mức giá này", html);
        Assert.DoesNotContain("menus-tier__cta", html);
    }

    [Fact]
    public async Task The_tier_cards_keep_the_individual_option_buttons()
    {
        var html = await GetPageAsync("/thuc-don");

        // Every option of every tier is still a link to its own detail
        // page — the options are the actions of the card now.
        Assert.Contains("Phương án A", html);
        Assert.Contains("Phương án B", html);
        Assert.Contains("Phương án C", html);

        // Nine public options across the four tiers, each one a link to
        // the combo detail route.
        Assert.Equal(9, CountOccurrences(html, "/thuc-don/combo/"));
    }

    private static int CountOccurrences(string haystack, string needle) =>
        haystack.Split(needle).Length - 1;
}

/// <summary>
/// Boots the application with the EF Core in-memory provider and a
/// seeded menu catalog, so the public tier cards render their options.
/// </summary>
public class MenuLandingWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _databaseName = Guid.NewGuid().ToString();

    /// <summary>Seeds the catalog the public pages read.</summary>
    public Task SeedAsync() => _seedTask ??= SeedCoreAsync();

    private Task? _seedTask;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        // The application must not use the connection string of the
        // configuration file while the tests run.
        builder.UseSetting("ConnectionStrings:DefaultConnection", string.Empty);

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions>();
            services.RemoveAll<DbContextOptions<PhiluWeddingDbContext>>();
            services.RemoveAll<PhiluWeddingDbContext>();

            services.AddDbContext<PhiluWeddingDbContext>(options =>
                options.UseInMemoryDatabase(_databaseName));
        });
    }

    private async Task SeedCoreAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PhiluWeddingDbContext>();

        await MenuCatalogSeeder.SeedAsync(db, NullLogger.Instance);
    }
}

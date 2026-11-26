using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PhiluWedding.Data;
using Xunit;

namespace PhiluWedding.Tests;

/// <summary>
/// Integration tests for the public wedding-consultation page
/// (<c>/dat-tiec</c>). They boot the application and check the HTML a
/// visitor actually receives: the click-to-call hotline, the Zalo chat
/// link, the consultation process — and the absence of the booking
/// form that used to live on this page.
/// </summary>
public class ConsultationPageMarkupTests : IClassFixture<ConsultationWebApplicationFactory>
{
    private readonly ConsultationWebApplicationFactory _factory;

    public ConsultationPageMarkupTests(ConsultationWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private async Task<string> GetPageAsync(string url)
    {
        var client = _factory.CreateClient();
        var html = await client.GetStringAsync(url);
        return WebUtility.HtmlDecode(html);
    }

    [Fact]
    public async Task The_consultation_page_is_served()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/dat-tiec");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task The_consultation_page_offers_the_hotline_and_zalo()
    {
        var html = await GetPageAsync("/dat-tiec");

        // Click-to-call, taken from the shared Brand:Contact configuration.
        Assert.Contains("tel:0905434115", html);
        Assert.Contains("0905434115", html);

        // The official Zalo chat link.
        Assert.Contains("https://zalo.me/0989821022", html);
        Assert.Contains("0989821022", html);

        // Both primary calls to action are on the page.
        Assert.Contains("GỌI HOTLINE", html);
        Assert.Contains("CHAT QUA ZALO", html);
    }

    [Fact]
    public async Task The_consultation_page_has_no_booking_form()
    {
        var html = await GetPageAsync("/dat-tiec");

        // The form itself is gone.
        Assert.DoesNotContain("<form", html);
        Assert.DoesNotContain("booking-form", html);
        Assert.DoesNotContain("asp-for", html);

        // And so are the fields it used to ask for.
        Assert.DoesNotContain("Họ và tên", html);
        Assert.DoesNotContain("Số điện thoại", html);
        Assert.DoesNotContain("Ngày tổ chức dự kiến", html);
        Assert.DoesNotContain("Ghi chú thêm", html);
    }

    [Fact]
    public async Task The_consultation_page_explains_the_process()
    {
        var html = await GetPageAsync("/dat-tiec");

        Assert.Contains("Quy trình tư vấn", html);
        Assert.Contains("Phạm vi tư vấn", html);

        // The four steps of the consultation.
        Assert.Contains("Bạn liên hệ", html);
        Assert.Contains("Chúng tôi tìm hiểu nhu cầu", html);
        Assert.Contains("Đề xuất sảnh và phương án", html);
        Assert.Contains("Tham quan và hoàn thiện", html);
    }

    [Fact]
    public async Task The_consultation_page_shows_both_confirmed_venue_addresses()
    {
        var html = await GetPageAsync("/dat-tiec");

        Assert.Contains("Tiệc cưới Phì Lũ", html);
        Assert.Contains("Golden Phoenix", html);

        Assert.Contains(
            "3 Đ. 2 Tháng 9, Hòa Cường, Đà Nẵng 550000, Việt Nam",
            html);
        Assert.Contains(
            "A8.2 Lô 1, 2 Đ. 2 Tháng 9, Hòa Cường, Đà Nẵng 550000, Việt Nam",
            html);
    }

    [Fact]
    public async Task The_consultation_page_has_no_hall_context_without_a_hall_id()
    {
        var html = await GetPageAsync("/dat-tiec");

        Assert.DoesNotContain("Sảnh tiệc bạn đang quan tâm", html);
    }

    [Fact]
    public async Task A_post_to_the_consultation_page_is_not_accepted()
    {
        var client = _factory.CreateClient();

        // The page has no form and no submission workflow any more, so a
        // POST must not create a booking request.
        var response = await client.PostAsync("/dat-tiec", new StringContent(string.Empty));

        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
    }
}

/// <summary>
/// Boots the application with the EF Core in-memory provider. The
/// consultation page does not read from the database for its content,
/// so no seeding is needed here.
/// </summary>
public class ConsultationWebApplicationFactory : WebApplicationFactory<Program>
{
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
                options.UseInMemoryDatabase(Guid.NewGuid().ToString()));
        });
    }
}

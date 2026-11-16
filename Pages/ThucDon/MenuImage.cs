namespace PhiluWedding.Pages.ThucDon;

/// <summary>
/// Maps a public menu option to its menu picture.
///
/// <para>
/// The pictures in <c>/images/menus</c> are named after the menu they show:
/// the price level in millions of VND followed by the option code — for
/// example <c>2A.png</c> is the picture of option A of the 2.500.000 VND
/// menu, <c>5C.png</c> the picture of option C of the 5.000.000 VND menu.
/// The pairing is therefore made on the names of the menus, never on
/// database ids or on the order of the list.
/// </para>
///
/// <para>
/// A menu without a picture simply has no path; the pages then render the
/// option without an image, exactly as before.
/// </para>
/// </summary>
internal static class MenuImage
{
    /// <summary>The folder the menu pictures live in.</summary>
    public const string Folder = "/images/menus";

    /// <summary>
    /// The price level of every public price tier, keyed by the stable tier
    /// key of <see cref="Services.PublicMenuScope"/>: 2.500.000 → 2,
    /// 3.000.000 → 3, 4.000.000 → 4, 5.000.000 → 5.
    /// </summary>
    private static readonly IReadOnlyDictionary<string, string> TierLevels =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["tier-02"] = "2",
            ["tier-04"] = "3",
            ["tier-07"] = "4",
            ["tier-08"] = "5"
        };

    /// <summary>
    /// Returns the path of the picture of a menu option, or <c>null</c> when
    /// the option has no picture of its own.
    /// </summary>
    /// <param name="tierKey">The stable key of the price tier of the option.</param>
    /// <param name="optionCode">The option code of the option (A, B or C).</param>
    public static string? Resolve(string? tierKey, string? optionCode)
    {
        if (string.IsNullOrWhiteSpace(tierKey) || string.IsNullOrWhiteSpace(optionCode))
        {
            return null;
        }

        if (!TierLevels.TryGetValue(tierKey.Trim(), out var level))
        {
            return null;
        }

        var code = optionCode.Trim().ToUpperInvariant();

        if (code.Length != 1)
        {
            return null;
        }

        return $"{Folder}/{level}{code}.png";
    }
}

using DumpFormatter.Json;

using System.Text.Json.Serialization;

namespace DumpFormatter.Model;

[JsonConverter(typeof(NameConverter))]
internal readonly record struct Name(uint Hash, string? String)
{
    public override string ToString() => String ?? $"0x{Hash:X08}";
    public string ToFormattedString() => String ?? ToFormattedHash();
    public string ToFormattedHash() => $"_0x{Hash:X08}"; // formatters output hashes with a prepended underscore

    public static Name FromHash(uint hash) => new(hash, Joaat.TryGetString(hash));
    public static Name FromString(string str) => new(Joaat.Hash(str), str);

    public bool Equals(Name other) => Hash == other.Hash;
    public override int GetHashCode() => Hash.GetHashCode();
}

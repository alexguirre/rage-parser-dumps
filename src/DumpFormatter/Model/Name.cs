using DumpFormatter.Json;

using System.Text.Json.Serialization;

namespace DumpFormatter.Model;

[JsonConverter(typeof(NameConverter))]
internal readonly record struct Name(uint Hash)
{
    public override string ToString()
        => $"0x{Hash:X08}";
}

using DumpFormatter.Json;

using System.Drawing;
using System.Text.Json.Serialization;

namespace DumpFormatter.Model;

[JsonConverter(typeof(PointerConverter))]
internal readonly record struct Pointer(ulong Address)
{
    public override string ToString() => $"0x{Address:X}";
}

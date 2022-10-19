using DumpFormatter.Json;

using System;
using System.Collections.Immutable;
using System.Text.Json.Serialization;

namespace DumpFormatter.Model;

[Flags, JsonConverter(typeof(EnumConverter<ParStructureFlags>))]
internal enum ParStructureFlags : ushort
{
    _0xB9C5D274 = 1 << 0,
    HAS_NAMES = 1 << 1,
    ALWAYS_HAS_NAMES = 1 << 2,
    _0x25CB183C = 1 << 3,
    _0x62BE3669 = 1 << 4,
    _0x22A1FBDB = 1 << 5,
}

[JsonConverter(typeof(ParStructureVersionConverter))]
internal readonly record struct ParStructureVersion(
    uint Major,
    uint Minor)
{
    public override string ToString() => $"{Major}.{Minor}";
}

internal readonly record struct ParStructureFactories(
    Pointer? New,
    Pointer? PlacementNew,
    Pointer? Delete);

internal readonly record struct ParStructureBase(
    Name Name,
    ulong Offset);

internal record ParStructure(
    Name Name,
    string? NameStr,
    ParStructureBase? Base,
    ulong Size,
    ulong Alignment,
    ParStructureFlags Flags,
    ParStructureVersion Version,
    ImmutableArray<ParMember> Members,
    ImmutableArray<string> MemberNames,
    ParAttributeList? ExtraAttributes,
    ParStructureFactories Factories,
    Pointer? GetStructureCB,
    Dictionary<string, Pointer>? Callbacks);

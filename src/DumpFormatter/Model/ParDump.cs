namespace DumpFormatter.Model;

internal record ParDump(
    string Game,
    ushort Build,
    ParStructure[] Structs,
    ParEnum[] Enums);

namespace DumpFormatter.Model;

internal record ParDump(
    string Game,
    string Build,
    ParStructure[] Structs,
    ParEnum[] Enums);

using DumpFormatter.Model;

namespace DumpFormatter.Formatters;

internal interface IDumpFormatter
{
    void Format(TextWriter writer, ParDump dump);
}

using DumpFormatter.Model;

using System.Text;
using System.Xml.Linq;

namespace DumpFormatter.Formatters;

internal class HtmlFormatter : PlainTextFormatter
{
    public override void Format(TextWriter writer, ParDump dump)
    {
        writer.WriteLine(@"
<!DOCTYPE html>
<html>
<head>
    <meta charset=""utf-8"" />
    <title>Test</title>
    <script src=""https://cdn.jsdelivr.net/gh/google/code-prettify@master/loader/run_prettify.js?autoload=true&amp;skin=default&amp;lang=css""></script>
    <style type=""text/css"">
    </style>
</head>
<body>");

        base.Format(writer, dump);

        writer.WriteLine(@"
</body>
</html>");
    }

    protected override void FormatStruct(TextWriter w, ParStructure s)
    {
        w.WriteLine($"<pre class=\"prettyprint\" id=\"{s.Name.Hash:X08}\">");
        base.FormatStruct(w, s);
        w.WriteLine("</pre>");
    }

    protected override void FormatEnum(TextWriter w, ParEnum e)
    {
        w.WriteLine($"<pre class=\"prettyprint\" id=\"{e.Name.Hash:X08}\">");
        base.FormatEnum(w, e);
        w.WriteLine("</pre>");
    }

    protected override void FormatMemberType(StringBuilder sb, ParMember m, out int length)
    {
        int startIndex = sb.Length;
        base.FormatMemberType(sb, m, out length);
        sb.Replace("<", "&lt", startIndex, sb.Length - startIndex)
          .Replace(">", "&gt", startIndex, sb.Length - startIndex);

        // add links to types
        foreach (var (typeStr, typeName) in enumerateTypeNames(m))
        {
            if (!typeName.HasValue) { continue; }

            var typeNameStr = typeName.Value.ToString();
            sb.Replace($"{typeStr} {typeNameStr}", $"{typeStr} <a href=\"#{typeName.Value.Hash:X08}\">{typeNameStr}</a>", startIndex, sb.Length - startIndex);
        }

        static IEnumerable<(string TypeStr, Name? TypeName)> enumerateTypeNames(ParMember m)
        {
            switch (m)
            {
                case ParMemberStruct s:
                    yield return ("struct", s.StructName);
                    break;
                case ParMemberEnum e:
                    yield return ("enum", e.EnumName);
                    break;
                case ParMemberArray arr:
                    foreach (var n in enumerateTypeNames(arr.Item)) { yield return n; }
                    break;
                case ParMemberMap map:
                    foreach (var n in enumerateTypeNames(map.Key)) { yield return n; }
                    foreach (var n in enumerateTypeNames(map.Value)) { yield return n; }
                    break;
            }
        }
    }
}

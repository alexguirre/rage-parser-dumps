using DumpFormatter.Model;

using System.Diagnostics.Metrics;
using System.Globalization;
using System.Net.Http.Headers;
using System.Xml.Linq;

namespace DumpFormatter.Formatters;

/// <summary>
/// Formats the dump as an XML Schema Definition (XSD) file.
/// Based on: https://github.com/GoatG33k/gta5-xsd/.
/// </summary>
internal class XsdFormatter : IDumpFormatter
{
    public void Format(TextWriter writer, ParDump dump)
    {
        var schema = Elem("schema", Attr(XNamespace.Xmlns, "xs", Xs));

        schema.Add(Elem("annotation",
            Elem("appinfo", $"{dump.Game.ToUpperInvariant()} XSD (generated {DateTime.UtcNow.ToShortDateString()})"),
            Elem("documentation",
                Attr(XNamespace.Xml, "lang", "en"),
                $"XML Schema Definition for {PrettyGameName(dump.Game)} (build {dump.Build})")
        ));

        AddCompatStructs(schema);
        AddRageElements(schema);
        foreach (var s in dump.Structs) { AddParStruct(schema, s); }
        foreach (var e in dump.Enums) { AddParEnum(schema, e); }

#if DEBUG
        Console.WriteLine("Validating XSD...");
        using var sw = new StringWriter(CultureInfo.InvariantCulture);
        schema.Save(sw);
        using var sr = new StringReader(sw.ToString());
        var numErrors = 0;
        var numWarnings = 0;
        System.Xml.Schema.XmlSchema.Read(sr, (s, e) =>
        {
            var ex = e.Exception;
            Console.WriteLine($"\t{ex.LineNumber}:{ex.LinePosition}: [{e.Severity}] {e.Message}");
            if (e.Severity == System.Xml.Schema.XmlSeverityType.Error) { numErrors++; }
            else if (e.Severity == System.Xml.Schema.XmlSeverityType.Warning) { numWarnings++; }
        });
        Console.WriteLine($"{numErrors} error(s).");
        Console.WriteLine($"{numWarnings} warning(s).");
#endif

        schema.Save(writer);
    }

    private static void AddCompatStructs(XElement schema)
    {
        schema.Add(
            Elem("element", Attr("name", "rockstar"),
                Elem("complexType",
                    Elem("sequence",
                        Elem("element", Attr("name", "name"), Attr("type", "xs:string")),
                        Elem("element", Attr("name", "id"), Attr("type", "xs:nonNegativeInteger")),
                        Elem("element", Attr("name", "BodyBuoyancyMultiplier"), Attr("type", "xs:decimal")),
                        Elem("element", Attr("name", "DragMultiplier"), Attr("type", "xs:decimal")),
                        Elem("element", Attr("name", "WeightBeltMultiplier"), Attr("type", "xs:decimal"))),
                    Elem("attribute", Attr("name", "master_version"), Attr("type", "xs:nonNegativeInteger")),
                    Elem("attribute", Attr("name", "representation_version"), Attr("type", "xs:nonNegativeInteger"))
        )));
    }

    private static void AddRageElements(XElement schema)
    {
        simpleContentValue("RAGEFloatArray", "float_array");
        simpleContentValue("RAGEVec2Array", "vector2_array");
        simpleContentValue("RAGEVec2VArray", "vec2v_array");
        simpleContentValue("RAGEVec3Array", "vector3_array");
        simpleContentValue("RAGEVec3VArray", "vec3v_array");
        simpleContentValue("RAGEVec4Array", "vector4_array");
        simpleContentValue("RAGEVec4VArray", "vec4v_array");
        simpleContentValue("RAGEIntArray", "int_array");
        simpleContentValue("RAGEUCharArray", "char_array");

        // RAGEBooleanArray
        schema.Add(
            Elem("complexType", Attr("name", "RAGEBooleanArray"),
                Elem("sequence",
                    Elem("element", Attr("name", "Item"), Attr("minOccurs", 0), Attr("maxOccurs", "unbounded"),
                        Elem("complexType",
                            Elem("attribute", Attr("name", "value"))
        )))));

        // RAGEBitset
        schema.Add(
            Elem("complexType", Attr("name", "RAGEBitset"),
                Elem("simpleContent",
                    Elem("extension", Attr("base", "xs:string"),
                        Elem("attribute", Attr("name", "bits"), Attr("type", "xs:nonNegativeInteger")),
                        Elem("attribute", Attr("name", "content"),
                            Elem("simpleType",
                                Elem("restriction", Attr("base", "xs:string"),
                                    Elem("pattern", Attr("value", "int_array"))
        )))))));

        // RAGEMixedDecimal
        schema.Add(
            Elem("simpleType", Attr("name", "RAGEMixedDecimal"),
                Elem("restriction", Attr("base", "xs:string"),
                    Elem("pattern", Attr("value", "(0x[0-9a-fA-F]+|-?[0-9]+(\\.-?[0-9]+((f|e-?[0-9]+))?)?)"))
        )));

        // RAGEHexAddress
        schema.Add(
            Elem("simpleType", Attr("name", "RAGEHexAddress"),
                Elem("restriction", Attr("base", "xs:string"),
                    Elem("pattern", Attr("value", "([0-9]+|0x[0-9a-fA-F]{1,16})"))
        )));

        // RAGEVoidValue
        schema.Add(
            Elem("complexType", Attr("name", "RAGEVoidValue"),
                Elem("attribute", Attr("name", "ref"), Attr("type", "xs:string"))
        ));

        // RAGEUnsignedValue
        schema.Add(
            Elem("simpleType", Attr("name", "RAGEUnsignedValue"),
                Elem("restriction", Attr("base", "xs:string"),
                    Elem("pattern", Attr("value", "(-1|[0-9]+)"))
        )));

        void simpleContentValue(string name, string contentValue)
        {
            schema.Add(
                Elem("complexType", Attr("name", name),
                    Elem("simpleContent",
                        Elem("extension", Attr("base", "xs:string"),
                            Elem("attribute", Attr("name", "content"),
                                Elem("simpleType",
                                    Elem("restriction", Attr("base", "xs:string"),
                                        Elem("pattern", Attr("value", contentValue))
            )))))));
        }
    }

    private static void AddParStruct(XElement schema, ParStructure s)
    {
        // generate reusable type
        var choice = Elem("choice", Attr("minOccurs", 0), Attr("maxOccurs", s.Members.Length));
        foreach (var m in s.Members) { AddParMember(choice, m); }

        var name = s.Name.ToFormattedString();
        schema.Add(
            Elem("complexType", Attr("name", name), Attr("mixed", true),
                choice
        ));

        // generate element
        schema.Add(Elem("element", Attr("name", name), Attr("type", name)));
    }

    private static XElement AddParMember(XElement x, ParMember m)
    {
        var name = m.Name.ToFormattedString();
        switch (m.Type)
        {
            case ParMemberType.ARRAY:
                // TODO: ParMemberType.ARRAY
                break;
            case ParMemberType.BITSET:
                x.Add(Elem("element", Attr("name", name), Attr("type", "RAGEBitset")));
                break;
            case ParMemberType.MAP:
                // TODO: ParMemberType.MAP
                break;
            case ParMemberType.STRUCT:
                var ms = (ParMemberStruct)m;
                if (ms.StructName != null)
                {
                    x.Add(
                        Elem("element", Attr("name", name),
                            Elem("complexType",
                                Elem("complexContent",
                                    Elem("extension", Attr("base", ms.StructName.Value.ToFormattedString()),
                                        Elem("attribute", Attr("name", "type"), Attr("type", "xs:string"))
                    )))));
                }
                else
                {
                    x.Add(Elem("element", Attr("name", name), Attr("type", "RAGEVoidValue")));
                }
                break;
            case ParMemberType.ENUM:
                var me = (ParMemberEnum)m;
                x.Add(Elem("element", Attr("name", name), Attr("type", me.EnumName.ToFormattedString())));
                break;
            case ParMemberType.VECTOR2:
            case ParMemberType.VEC2V:
                x.Add(
                    Elem("element", Attr("name", name),
                        Elem("complexType",
                            Elem("attribute", Attr("name", "x"), Attr("type", "RAGEMixedDecimal")),
                            Elem("attribute", Attr("name", "y"), Attr("type", "RAGEMixedDecimal"))
                )));
                break;
            case ParMemberType.VECTOR3:
            case ParMemberType.VEC3V:
                x.Add(
                    Elem("element", Attr("name", name),
                        Elem("complexType",
                            Elem("attribute", Attr("name", "x"), Attr("type", "RAGEMixedDecimal")),
                            Elem("attribute", Attr("name", "y"), Attr("type", "RAGEMixedDecimal")),
                            Elem("attribute", Attr("name", "z"), Attr("type", "RAGEMixedDecimal"))
                )));
                break;
            case ParMemberType.VECTOR4:
            case ParMemberType.VEC4V:
                x.Add(
                    Elem("element", Attr("name", name),
                        Elem("complexType",
                            Elem("attribute", Attr("name", "x"), Attr("type", "RAGEMixedDecimal")),
                            Elem("attribute", Attr("name", "y"), Attr("type", "RAGEMixedDecimal")),
                            Elem("attribute", Attr("name", "z"), Attr("type", "RAGEMixedDecimal")),
                            Elem("attribute", Attr("name", "w"), Attr("type", "RAGEMixedDecimal"))
                )));
                break;
            case ParMemberType.FLOAT:
            case ParMemberType.FLOAT16:
            case ParMemberType.DOUBLE:
                x.Add(
                    Elem("element", Attr("name", name),
                        Elem("complexType",
                            Elem("attribute", Attr("name", "value"), Attr("type", "RAGEMixedDecimal"))
                )));
                break;
            case ParMemberType.BOOL:
                x.Add(
                    Elem("element", Attr("name", name),
                        Elem("complexType",
                            Elem("attribute", Attr("name", "value"), Attr("type", "xs:boolean"))
                )));
                break;
            case ParMemberType.SHORT:
            case ParMemberType.INT:
            case ParMemberType.INT64:
            case ParMemberType.PTRDIFFT:
                x.Add(
                    Elem("element", Attr("name", name),
                        Elem("complexType",
                            Elem("attribute", Attr("name", "value"), Attr("type", "xs:integer"))
                )));
                break;
            case ParMemberType.UINT:
            case ParMemberType.UINT64:
            case ParMemberType.SIZET:
                x.Add(
                    Elem("element", Attr("name", name),
                        Elem("complexType",
                            Elem("attribute", Attr("name", "value"), Attr("type", "RAGEHexAddress"))
                )));
                break;
            case ParMemberType.UCHAR:
            case ParMemberType.USHORT:
                x.Add(
                    Elem("element", Attr("name", name),
                        Elem("complexType",
                            Elem("attribute", Attr("name", "value"), Attr("type", "RAGEUnsignedValue"))
                )));
                break;
            case ParMemberType.CHAR:
                x.Add(
                    Elem("element", Attr("name", name),
                        Elem("complexType",
                            Elem("attribute", Attr("name", "value"), Attr("type", "xs:nonNegativeInteger"))
                )));
                break;
            case ParMemberType.MAT33V:
                // TODO: ParMemberType.MAT33V
                break;
            case ParMemberType.MATRIX34:
            case ParMemberType.MAT34V:
                // TODO: ParMemberType.MATRIX34/MAT34V
                break;
            case ParMemberType.STRING:
                x.Add(Elem("element", Attr("name", name), Attr("type", "xs:string")));
                break;
            case ParMemberType.GUID:
                // TODO: ParMemberType.GUID
                break;
            case ParMemberType.QUATV:
                // TODO: check ParMemberType.QUATV
                goto case ParMemberType.VEC4V;
            case ParMemberType.SCALARV:
                // TODO: check ParMemberType.SCALARV
                goto case ParMemberType.FLOAT;
            default:
                throw new InvalidOperationException($"Unknown member type '{m.Type}'");

        }

        return x;
    }

    private static void AddParEnum(XElement schema, ParEnum e)
    {
        var restriction = Elem("restriction", Attr("base", "xs:string"));
        for (int i = 0; i < e.Values.Length; i++)
        {
            var value = e.Values[i];
            restriction.Add(Elem("enumeration", Attr("value", value.Name.ToFormattedString())));
        }

        schema.Add(
            Elem("simpleType", Attr("name", e.Name.ToFormattedString()),
                restriction
        ));
    }

    private static readonly XNamespace Xs = XNamespace.Get("http://www.w3.org/2001/XMLSchema");
    private static XElement Elem(string localName, params object?[] content) => new(Xs + localName, content);
    private static XAttribute Attr(XName name, object value) => new(name, value);
    private static XAttribute Attr(XNamespace ns, string localName, object value) => new(ns + localName, value);

    private static string PrettyGameName(string game)
        => game.ToUpperInvariant() switch
        {
            "GTA5" => "Grand Theft Auto V",
            "RDR3" => "Red Dead Redemption 2",
            _ => "Unknown Game"
        };
}

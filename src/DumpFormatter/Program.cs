using DumpFormatter.Formatters;
using DumpFormatter.Model;

using System.CommandLine;
using System.Text;
using System.Text.Json;

namespace DumpFormatter;

internal static class Program
{
    enum Format
    {
        PlainText,
        Html,
        Xsd,
    }
    
    static int Main(string[] args)
    {
        var format = new Argument<Format>("format", "The dump output format.");
        var input = new Argument<FileInfo>("input", "The input JSON dump file.");
        var output = new Argument<FileInfo>("output", "The output formatted dump file.");

        var root = new RootCommand()
        {
            format,
            input, output,
        };
        root.SetHandler(Handler, format, input, output);
        return root.Invoke(args);
    }

    static void Handler(Format format, FileInfo input, FileInfo output)
    {
        Console.WriteLine($"Format: {format}");
        Console.WriteLine($"Input:  {input}");
        Console.WriteLine($"Output: {output}");

        ParDump dump;
        var opt = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        using (var inputStream = input.OpenRead())
        {
            dump = JsonSerializer.Deserialize<ParDump>(inputStream, opt) ?? throw new ArgumentException($"JSON deserialization of '{input.FullName}' returned null");
        }
        
        IDumpFormatter formatter = format switch
        {
            Format.PlainText => new PlainTextFormatter(),
            Format.Html => new HtmlFormatter(),
            Format.Xsd => new XsdFormatter(),
            _ => throw new ArgumentException($"Unknown format '{format}'"),
        };
        
        using (var outputStream = output.OpenWrite())
        {
            using var outputWriter = new StreamWriter(outputStream, Encoding.UTF8);
            formatter.Format(outputWriter, dump);
        }
    }
}

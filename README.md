# higlass-tabix-datafetcher
Provide remote access to remotely-hosted tabix files to HiGlass client applications

## Usage

This enables access to a web-hosted tabix file for use with the `higlass-transcripts` (https://github.com/higlass/higlass-transcripts) plug-in.

Register the data fetcher in your HiGlass application:

```
import register from "higlass-register";
import { TabixDataFetcher } from "higlass-tabix-datafetcher";

register (
  { 
    dataFetcher: TabixDataFetcher, 
    config: TabixDataFetcher.config,
  },
  { 
    pluginType: "dataFetcher",
  }
);
```

Configure the view configuration's `horizontal-transcripts` object with `data` attributes pointing to the web-hosted tabix file:

```
{
  "name": "My Transcripts",
  "type": "horizontal-transcripts",
  "uid": "my_transcripts_uid",
  "options": {
    "fontSize": 9, // font size for labels and amino acids (if available)
    "fontFamily": "Helvetica",
    "labelFontColor": "#333333",
    "labelBackgroundPlusStrandColor": "#ffffff",
    "labelBackgroundMinusStrandColor": "#ffffff",
    "labelStrokePlusStrandColor": "#999999",
    "labelStrokeMinusStrandColor": "#999999",
    "plusStrandColor": "#bdbfff", // color of coding parts of the exon on the plus strand
    "minusStrandColor": "#fabec2", // color of coding parts of the exon on the negative strand
    "utrColor": "#C0EAAF", // color of untranslated regions of the exons
    "backgroundColor": "#ffffff", // color of track background
    "transcriptHeight": 12, // height of the transcripts
    "transcriptSpacing": 2, // space in between the transcripts
    "name": "Gene transcripts",
    "maxTexts": 50, // Maximum number of labels shown on the screen
    "showToggleTranscriptsButton": true, // If the "Show fewer transcripts"/"Show more transcripts" is shown
    "trackHeightAdjustment": "automatic", // if "automatic", the height of the track is adjusted to the number of visible transcripts.
    "startCollapsed": false, // if true, only one transcript is shown
  },
  "data" : {
    "type": "tabix",
    "url": "https://example.com/tabix/my_transcripts.gz",
    "chromSizesUrl": "https://example.com/tabix/hg38.chromSizes.gz",
  },
}
```

There should be an associated index file hosted at `https://example.com/tabix/my_transcripts.gz.tbi`.

The file `https://example.com/tabix/my_transcripts.gz` is compressed with `bgzip` and indexed with `tabix`. For example:

```
$ gunzip -c my_transcripts.gz | more
chr1	11869	14409	DDX11L1-001	101	+	ENSG00000223972.5	ENST00000456328.2	transcribed_unprocessed_pseudogene	11869,12613,13221	12227,12721,14409	.	.
chr1	12010	13670	DDX11L1-002	90	+	ENSG00000223972.5	ENST00000450305.2	transcribed_unprocessed_pseudogene	12010,12179,12613,12975,13221,13453	12057,12227,12697,13052,13374,13670	.	.
chr1	14404	29570	WASH7P-001	101	-	ENSG00000227232.5	ENST00000488147.1	unprocessed_pseudogene	14404,15005,15796,16607,16858,17233,17606,17915,18268,24738,29534	14501,15038,15947,16765,17055,17368,17742,18061,18366,24891,29570	.	.
chr1	17369	17436	MIR6859-1-001	101	-	ENSG00000278267.1	ENST00000619216.1	miRNA	17369	17436	.	.
chr1	29554	31097	MIR1302-2HG-001	101	+	ENSG00000243485.5	ENST00000473358.1	lncRNA	29554,30564,30976	30039,30667,31097	.	.
...
```

The format of data is currently driven by the `formatTranscriptData` function in `higlass-transcripts`, where transcript metadata are stored in thirteen columns:

```
formatTranscriptData(ts) {
  const strand = ts[5];
  const stopCodonPos = ts[12] === "." ? "." : (strand === "+" ? +ts[12] + 2 : +ts[12] - 1);
  const startCodonPos = ts[11] === "." ? "." : (strand === "+" ? +ts[11] - 1 : +ts[11] + 2);
  const exonStarts = ts[9].split(",").map((x) => +x - 1);
  const exonEnds = ts[10].split(",").map((x) => +x);
  const txStart = +ts[1] - 1;
  const txEnd = +ts[2] - 1;

  const result = {
    transcriptId: this.transcriptId(ts),
    transcriptName: ts[3],
    txStart: txStart,
    txEnd: txEnd,
    strand: strand,
    chromName: ts[0],
    codingType: ts[8],
    exonStarts: exonStarts,
    exonEnds: exonEnds,
    startCodonPos: startCodonPos,
    stopCodonPos: stopCodonPos,
    importance: +ts[4],
  };
  return result;
}
```
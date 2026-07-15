# Content Asset Context

This context turns uploaded media into durable, reviewable text assets and regenerable editorial derivatives.

## Language

**Transcript**:
The durable content asset created from one media transcription, including its source facts, diagnostics, and derivatives.
_Avoid_: Result, podcast record

**Speaker**:
An anonymous identity used to group speech within one Transcript; its stable key is separate from its editable display name.
_Avoid_: Person, voice name

**Segment**:
One immutable ASR fact containing source text, time range, and source speaker attribution.
_Avoid_: Paragraph, chapter

**Turn**:
A regenerable reading unit assembled from adjacent Segments; user corrections belong to the Turn and never replace source Segment facts.
_Avoid_: Segment, paragraph

**Summary Artifact**:
A regenerable editorial derivative of a Transcript, including its overview, chapters, speaker viewpoints, and highlights.
_Avoid_: Formatted transcript, source fact

**Evidence Range**:
The ordered Segment range supporting one Summary Artifact item; displayed time ranges are derived from this evidence.
_Avoid_: AI timestamp

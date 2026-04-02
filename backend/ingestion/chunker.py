import re


def chunk_text(
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> list[str]:
    """
    Split text into overlapping chunks using semantic boundaries.
    Prefers splitting at paragraph breaks, then sentences, then words.
    """
    # Clean up whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    text = text.strip()

    if len(text) <= chunk_size:
        return [text] if text else []

    chunks: list[str] = []
    separators = ["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " "]

    def split_recursive(text: str, sep_idx: int = 0) -> list[str]:
        if len(text) <= chunk_size:
            return [text] if text.strip() else []

        if sep_idx >= len(separators):
            # Hard split as last resort
            result = []
            for i in range(0, len(text), chunk_size - chunk_overlap):
                piece = text[i : i + chunk_size]
                if piece.strip():
                    result.append(piece.strip())
            return result

        sep = separators[sep_idx]
        parts = text.split(sep)

        result = []
        current = ""

        for part in parts:
            candidate = f"{current}{sep}{part}" if current else part

            if len(candidate) <= chunk_size:
                current = candidate
            else:
                if current:
                    result.append(current.strip())
                # If a single part exceeds chunk_size, split it further
                if len(part) > chunk_size:
                    result.extend(split_recursive(part, sep_idx + 1))
                    current = ""
                else:
                    current = part

        if current.strip():
            result.append(current.strip())

        return result

    raw_chunks = split_recursive(text)

    # Add overlap between consecutive chunks
    for i, chunk in enumerate(raw_chunks):
        if i > 0 and chunk_overlap > 0:
            prev = raw_chunks[i - 1]
            overlap_text = prev[-chunk_overlap:]
            # Only add overlap if it doesn't start mid-word
            space_idx = overlap_text.find(" ")
            if space_idx != -1:
                overlap_text = overlap_text[space_idx + 1 :]
            chunk = f"{overlap_text} {chunk}"
        chunks.append(chunk.strip())

    return [c for c in chunks if len(c) > 20]  # Filter out tiny fragments

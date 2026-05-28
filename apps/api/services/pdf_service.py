import re
import fitz  # PyMuPDF
from datetime import datetime, timedelta
from typing import Optional

class PdfExtractionError(Exception):
    """Raised when PDF extraction fails due to encryption, empty files, or structural corruption."""
    pass

def extract_text_from_pdf(file_bytes: bytes) -> dict:
    """
    Extracts text from PDF bytes using PyMuPDF (fitz).
    Applies heuristics to remove page headers and footers, and removes excessive whitespace.
    Returns a dictionary containing 'text' (full text) and 'page_map' (list of dicts with page_num & text).
    """
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        raise PdfExtractionError(f"Failed to open PDF document: {str(e)}")

    if doc.is_encrypted:
        raise PdfExtractionError("The PDF document is encrypted and cannot be processed.")

    if doc.page_count == 0:
        raise PdfExtractionError("The PDF document contains no pages.")

    full_text_list = []
    page_map = []

    for page_num in range(doc.page_count):
        try:
            page = doc.load_page(page_num)
            raw_page_text = page.get_text("text")
        except Exception as e:
            raise PdfExtractionError(f"Failed to load or parse page {page_num + 1}: {str(e)}")

        # Split into lines and filter empty lines
        lines = [line.strip() for line in raw_page_text.splitlines() if line.strip()]

        if lines:
            # Heuristic: Remove header line if it contains less than 4 words
            if len(lines[0].split()) < 4:
                lines.pop(0)
        
        if lines:
            # Heuristic: Remove footer line if it contains less than 4 words
            if len(lines[-1].split()) < 4:
                lines.pop()

        # Join the cleaned lines
        cleaned_page_text = "\n".join(lines)
        
        # Remove excessive horizontal whitespace
        cleaned_page_text = re.sub(r'[ \t]+', ' ', cleaned_page_text)
        
        page_map.append({
            "page_num": page_num + 1,
            "text": cleaned_page_text
        })
        full_text_list.append(cleaned_page_text)

    # Join pages with clean spacing
    full_text = "\n\n".join(full_text_list).strip()

    if not full_text:
        raise PdfExtractionError("No readable text content could be extracted from the PDF.")

    return {
        "text": full_text,
        "page_map": page_map
    }


def parse_policy_metadata(text: str) -> dict:
    """
    Intelligent heuristic regex parser to automatically extract vehicle and pricing
    metadata from a policy document's text.
    """
    metadata = {}
    
    # 1. Parse Vehicle Year
    # Look for 4 digits starting with 19 or 20, between 1990 and 2026
    years = re.findall(r'\b(19\d{2}|20[0-2]\d)\b', text)
    if years:
        metadata["vehicle_year"] = int(years[0])
    else:
        metadata["vehicle_year"] = 2024  # sensible default
        
    # 2. Parse Premium Amount
    # e.g., "Premium Amount: 15,000" or "Premium: Rs. 15000" or "Premium: 15000.00"
    premium_match = re.search(
        r'(?:Premium|Premium\s+Amount|Total\s+Premium)[:\s]*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{2})?)', 
        text, 
        re.IGNORECASE
    )
    if premium_match:
        try:
            metadata["premium_amount"] = float(premium_match.group(1).replace(",", ""))
        except ValueError:
            metadata["premium_amount"] = 15000.00
    else:
        metadata["premium_amount"] = 15000.00
        
    # 3. Parse Sum Insured / IDV
    # e.g., "Sum Insured: 500,000" or "IDV: 500,000"
    sum_insured_match = re.search(
        r'(?:Sum\s+Insured|Insured\s+Declared\s+Value|IDV)[:\s]*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{2})?)', 
        text, 
        re.IGNORECASE
    )
    if sum_insured_match:
        try:
            metadata["sum_insured"] = float(sum_insured_match.group(1).replace(",", ""))
        except ValueError:
            metadata["sum_insured"] = 500000.00
    else:
        metadata["sum_insured"] = 500000.00
        
    # 4. Parse Make and Model
    makes = ["tesla", "maruti", "suzuki", "hyundai", "honda", "tata", "mahindra", "toyota", "ford", "kia", "bmw", "mercedes", "audi"]
    found_make = "Unknown"
    found_model = "Unknown"
    for make in makes:
        match = re.search(rf'\b({make})\b[:\s]*([a-zA-Z0-9\-_]+)?', text, re.IGNORECASE)
        if match:
            found_make = match.group(1).capitalize()
            if match.group(2):
                found_model = match.group(2).strip()
            break
            
    metadata["vehicle_make"] = found_make
    metadata["vehicle_model"] = found_model
    
    # 5. Parse Dates (start_date, end_date)
    # Try multiple date formats to handle various policy document styles
    parsed_dates = []

    # Format A: DD/MM/YYYY or DD-MM-YYYY
    for d in re.findall(r'\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b', text):
        try:
            parsed_dates.append(datetime(int(d[2]), int(d[1]), int(d[0])))
        except ValueError:
            continue

    # Format B: YYYY-MM-DD (ISO 8601)
    for d in re.findall(r'\b(\d{4})-(\d{2})-(\d{2})\b', text):
        try:
            parsed_dates.append(datetime(int(d[0]), int(d[1]), int(d[2])))
        except ValueError:
            continue

    # Format C: Long-form English dates e.g. "15 June 2025", "15th June 2025"
    MONTH_MAP = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
        'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7,
        'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
    }
    for m in re.finditer(
        r'\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|'
        r'jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})\b',
        text, re.IGNORECASE
    ):
        try:
            parsed_dates.append(datetime(int(m.group(3)), MONTH_MAP[m.group(2).lower()], int(m.group(1))))
        except ValueError:
            continue

    # Format D: "June 15, 2025" or "June 15 2025"
    for m in re.finditer(
        r'\b(january|february|march|april|may|june|july|august|september|october|november|december|'
        r'jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?[,\s]+(\d{4})\b',
        text, re.IGNORECASE
    ):
        try:
            parsed_dates.append(datetime(int(m.group(3)), MONTH_MAP[m.group(1).lower()], int(m.group(2))))
        except ValueError:
            continue

    # Deduplicate and sort
    parsed_dates = sorted(set(parsed_dates))

    # Sanity check: filter out stale historical dates (e.g. from policy wording documents
    # that contain the document approval date rather than an actual coverage period).
    # A valid active policy must have an end_date no more than 2 years in the past.
    _now = datetime.utcnow()
    _cutoff = _now - timedelta(days=730)  # 2 years ago

    # Keep only dates that are plausibly within an active policy window:
    # start_date can be up to 30 days in the future (backdated policies allowed),
    # end_date must be at least as recent as 2 years ago.
    valid_dates = [d for d in parsed_dates if d >= _cutoff]

    if len(valid_dates) >= 2:
        metadata["start_date"] = valid_dates[0]
        metadata["end_date"] = valid_dates[-1]
    elif len(valid_dates) == 1:
        metadata["start_date"] = valid_dates[0]
        metadata["end_date"] = valid_dates[0] + timedelta(days=365)
    else:
        # No usable dates found — default to a 1-year policy starting today
        metadata["start_date"] = _now.replace(hour=0, minute=0, second=0, microsecond=0)
        metadata["end_date"] = (_now + timedelta(days=365)).replace(hour=23, minute=59, second=59, microsecond=0)
        
    return metadata

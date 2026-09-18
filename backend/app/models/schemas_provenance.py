"""Data provenance and physical cell identity schemas."""
import re
from enum import Enum
from typing import Annotated
from pydantic import AfterValidator


class ProvenanceEnum(str, Enum):
    """Data origin tag: REAL, SYNTHETIC, or PREDICTED."""
    REAL = "REAL"             # Empirical physical laboratory measurements (e.g. NASA Ames)
    SYNTHETIC = "SYNTHETIC"   # Physically simulated or computationally generated (10s pulse, 8x8 frames)
    PREDICTED = "PREDICTED"   # Machine learning inference or statistical prediction


class TriageClassEnum(str, Enum):
    """Second-life battery classification decision categories."""
    REUSE = "REUSE"
    RETIRE = "RETIRE"
    INVESTIGATE = "INVESTIGATE"


def validate_physical_cell_id(v: str) -> str:
    r"""
    Enforces that cell_id represents strictly a physical cell and rejects composite cycle strings.
    
    1. Rejects non-strings and whitespace-only strings.
    2. Stage 1 pre-filter: Explicitly rejects cycle-qualified forms containing:
       - -CYC<number>, _cycle<number>, -cyc<number>, _CYC<number>
       - or equivalent cycle suffixes (via re.search(r"(?i)[-_]?(?:cyc|cycle)\d+$", v_clean)).
       Cycle information belongs exclusively in the separate cycle_index field.
    3. Stage 2 format validation: Requires pure physical cell identifier format:
       ^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$
    """
    if not isinstance(v, str):
        raise ValueError("cell_id must be a string")
    v_clean = v.strip()
    if not v_clean:
        raise ValueError("cell_id cannot be empty")
    # Reject terminal composite cycle markers like -CYC40, _cycle10, etc.
    if re.search(r"(?i)[-_]?(?:cyc|cycle)\d+$", v_clean):
        raise ValueError(f"cell_id '{v}' invalid: composite cycle strings are prohibited. Keep cycle in cycle_index.")
    # Must match alphanumeric identifiers (e.g. 'B0005', 'HW-001', 'CELL_A', 'INR18650-25R')
    if not re.match(r"^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$", v_clean):
        raise ValueError(f"cell_id '{v}' invalid format: must be a valid physical cell identifier")
    return v_clean


PhysicalCellId = Annotated[str, AfterValidator(validate_physical_cell_id)]

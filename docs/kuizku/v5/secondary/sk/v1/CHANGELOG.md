# KuizKu Secondary SK V1 - Changelog

**Version**: v1 (initial public consolidated snapshot)
**Bank ID**: `llcai_kuizku_v5_secondary_sk`
**Publisher**: leonchoo
**Published at**: 2026-09-25T00:00:00Z
**Manifest version**: 1.0
**Encryption**: H2 (Plain JSON, no encryption)

## What's New

### First consolidated public snapshot of Secondary SK

This is the **first formal publication** of the KuizKu Secondary SK (Sekolah Kebangsaan / KSSM) question bank as a versioned, integrity-checked consolidated snapshot. **All 28 canonical banks** from `leonchoo/kuizku-content` are aggregated into this version.

### Coverage

| Tier | Subjects | Q Count |
|---|---|---|
| T1 | Bahasa Melayu, English, Mathematics, Science | 2,050 |
| T2 | Bahasa Melayu, English, Mathematics, Science | 2,000 |
| T3 | Bahasa Melayu, English, Mathematics, Science | 2,000 |
| T4 | BM, Math, AddMath, Science, Physics, Chemistry, Biology, English | 4,000 |
| T5 | BM, English, Math, AddMath, Science, Physics, Chemistry, Biology | 4,000 |
| **TOTAL** | **28 banks** | **14050** |

### File layout

| File | Size | Purpose |
|---|---|---|
| `manifest.json` | ~50 KB | Versioned manifest: integrity, schema, encryption |
| `index.json` | ~12 KB | Index with per-bank and per-tier summaries; tier-level SHA references |
| `t1.json` | ~700 KB | T1 consolidated payload (4 banks × ~500-700 questions) |
| `t2.json` | ~600 KB | T2 consolidated payload (4 banks × 500 questions each) |
| `t3.json` | ~600 KB | T3 consolidated payload (4 banks × 500 questions each) |
| `t4.json` | ~1.2 MB | T4 consolidated payload (8 banks × 500 questions each) |
| `t5.json` | ~1.2 MB | T5 consolidated payload (8 banks × 500 questions each) |
| `CHANGELOG.md` | this file | Release notes |

### Special cases (preserved AS-IS per user directive)

1. **T1 BM has 550 questions** (50 surplus vs 500 standard for all other banks). The 50 surplus questions are
   preserved intact. Per user directive, no QA rewrite, no subset removal, no re-grouping has been performed. T1 BM is treated as **canonical** with 550 questions.

2. **T1 BM has 25 questions missing the `stage` field** (legacy/v5-compatibility gap). These 25 questions are preserved AS-IS. **No `stage` field is back-filled.** This is documented in `manifest.integrity.fieldGapPolicy` for downstream consumers.

## SHA-256 Computation Rules

- **Manifest SHA-256 (`integrity.manifestSha256`)**: Computed over the manifest's serialized JSON bytes with `integrity.manifestSha256` field temporarily set to `"0" * 64` (a 64-character zero placeholder) during computation. The final SHA is then plugged back into the field. This recursive self-reference is verified at publication time by reversing the substitution (zero-pad → re-compute SHA) and confirming equality.
- **Per-tier file SHA-256 (`publishedFiles.tierFiles[i].sha256`)**: Computed over the file bytes of the published tier file (compact JSON dump with `ensure_ascii=False` and `separators=(',', ':')`).
- **Per-bank canonical GitHub Blob SHA (`integrity.banks[i].canonicalGitHubBlobSha`)**: Preserved from GitHub API; must never be replaced by a local recomputation. The canonical source of truth lives at GitHub.
- **Global aggregate SHA-256 (`integrity.global.globalPayloadSha256`)**: SHA-256 of the concatenation of tier payload bytes in tier order T1, T2, T3, T4, T5 (each tier's bytes read back from disk).
- **Determinism guarantee**: The same 28 banks with the same content and the same ordering always produce the same global SHA-256 (no randomness, no timestamps in the computed bytes).

## Source Provenance

All question content, IDs, options, answers, and explanations are reproduced **verbatim** from the 28 canonical public banks under `banks/secondary/sk/<subject>/t<N>.json` in the `leonchoo/kuizku-content` repository on GitHub (`main` branch). **No question regeneration has been performed.** The content was loaded into `consolidation_manifest.json` from the canonical GitHub blobs, then partitioned into the per-tier files published here.

## Compatibility

- The existing 28 public banks at `banks/secondary/sk/<subject>/t<N>.json` are preserved unchanged.
- This V1 publication is a **versioned snapshot** that complements the existing layout.
- The `index.json` provides a stable mapping back to the canonical GitHub paths.
- For Android consumption, see the publication plan at `D:\Users\bajub\kuizku_p10\consolidation_publication_plan.md` (internal).
- V4 (Primary SK) is at `docs/kuizku/v4/` and is **completely untouched** by this V1 Secondary publication.

## Verification Before Commit

- All 28 GitHub canonical bank SHAs verified to match the source manifest.
- Per-tier SHA-256 verified against file bytes.
- Manifest SHA-256 verified self-referentially.
- Global aggregate SHA-256 verified deterministic.
- T1 BM 550 + 25 stage-less preserved.
- All 4 canonical English path variants (T1-T3 `en/`, T4-T5 `english/`) handled correctly.

## End of Changelog

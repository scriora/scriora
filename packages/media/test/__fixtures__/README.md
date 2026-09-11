# Media Test Fixtures

Binary test files for media processing validation.
Reference: scriora-docs/architecture/SCRIORA_TEST_AND_SECURITY.md

## Required Fixtures (add before Phase 0 media tests)

| File | Purpose |
|---|---|
| valid-jpeg.jpg | Standard JPEG for happy-path image tests |
| valid-png.png | PNG with transparency |
| panorama.jpg | Wide image (3:1+ ratio) for splitter tests |
| document.pdf | Multi-page PDF for carousel tests |
| h264-video.mp4 | Standard H.264 MP4 for transcode tests |
| malicious-bomb.png | Decompression bomb for security tests |
| corrupted.mp4 | Corrupt MP4 for validation tests |

DO NOT commit real user media or PII in fixtures.

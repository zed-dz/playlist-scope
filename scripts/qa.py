"""QA runner. Used by CI and locally.
Usage: python3 scripts/qa.py <url>
Exit code is the number of findings (0 == pass).
"""
import sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173"
findings = []
def note(sev, area, msg):
    findings.append((sev, area, msg))
    print(f"  [{sev}] {area}: {msg}")

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_context(viewport={"width": 1400, "height": 900}).new_page()
    errors, console_errs = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: console_errs.append(m.text)
            if m.type == "error" and "compute-pressure" not in m.text else None)

    page.goto(URL, wait_until="networkidle", timeout=30000)
    page.wait_for_selector("header", timeout=15000)
    time.sleep(2)

    for t in ["Briefing", "Videos", "Search", "Tools", "Links", "Channels", "Reports", "Compare", "Library"]:
        try:
            page.locator(f"button.tab-btn:has-text('{t}')").first.click(timeout=4000)
            time.sleep(0.4)
            print(f"  ✓ {t}")
        except Exception as e:
            note("BUG", f"tab/{t}", str(e)[:80])

    page.locator("button.tab-btn:has-text('Videos')").first.click()
    time.sleep(0.5)
    page.locator(".card.card-hover").first.click()
    time.sleep(0.5)
    for vt in ["Overview", "Transcript", "Comments", "Chapters", "Quotes", "Notes", "Links", "Ask"]:
        try:
            page.locator(f".modal-content button.tab-btn:has-text('{vt}')").first.click(timeout=2500)
            time.sleep(0.3)
            print(f"  ✓ modal/{vt}")
        except Exception as e:
            note("BUG", f"modal/{vt}", str(e)[:80])

    for e in errors: note("BUG", "page", e[:160])
    for e in console_errs: note("WARN", "console", e[:160])
    b.close()

print(f"\nTotal findings: {len(findings)}")
sys.exit(len(findings))

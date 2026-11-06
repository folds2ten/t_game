"""Regenerate the guide screenshots in docs/screenshots/.

Drives the real game in headless Chromium. Scenes that would take a long walk to reach are
staged by moving the player through the game's own globals (placeAt, handleChat, ...).
Nothing in the game code changes.

Usage: python scripts/screenshots.py
"""

from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "screenshots"
VIEWPORT = {"width": 1280, "height": 860}


def shot(page: Page, name: str, wait_ms: int = 600) -> None:
    """Wait for the game loop to redraw, then save a PNG."""
    page.wait_for_timeout(wait_ms)
    page.screenshot(path=str(OUT / f"{name}.png"))
    print(f"  saved {name}.png")


def stage(page: Page, js: str) -> None:
    """Run staging JS against the game's globals, then force a UI refresh."""
    page.evaluate(f"() => {{ {js}; markExplored(); drawMinimap(); ui.dirty = true; }}")


def new_character(page: Page, name: str, voc: str) -> None:
    """Start a fresh character from the title screen."""
    page.evaluate("() => localStorage.clear()")
    page.reload()
    page.fill("#name", name)
    page.click(f'[data-voc="{voc}"]')
    page.wait_for_timeout(400)


def buff(page: Page, level: int) -> None:
    """Make the staged character sturdy enough to survive the shot."""
    stage(page, f"""
        gainXp(player, xpForLevel({level}) - player.xp);
        player.hp = maxHp(player); player.mana = maxMana(player);
        player.lumen = 300;
    """)


def fight_nearest(page: Page, ms: int = 4500) -> None:
    """Stand next to the closest creature on this floor and attack it."""
    stage(page, """
        const c = creatures.filter((k) => k.z === player.z && k.hp > 0)
          .sort((a, b) => dist(a, player) - dist(b, player))[0];
        for (const [dx, dy] of DIRS8) {
          if (canEnter(c.x + dx, c.y + dy, c.z)) { placeAt(player, c.x + dx, c.y + dy, c.z); break; }
        }
        player.target = c;
    """)
    page.wait_for_timeout(ms)


def main() -> None:
    """Capture every scene used by README.md and GUIDE.md."""
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport=VIEWPORT)
        page.goto((ROOT / "index.html").as_uri())

        page.evaluate("() => localStorage.clear()")
        page.reload()
        page.fill("#name", "Ashlen")
        shot(page, "01-character-select", 300)

        new_character(page, "Ashlen", "warden")
        stage(page, "placeAt(player, 9, 9, 0)")
        shot(page, "02-town")

        stage(page, "placeAt(player, 9, 5, 0); handleChat('hi', performance.now())")
        page.wait_for_timeout(300)
        stage(page, "handleChat('trade', performance.now())")
        shot(page, "03-trade")

        stage(page, "closeWindow(); handleChat('quest', performance.now())")
        shot(page, "04-quest")

        buff(page, 8)
        stage(page, "closeWindow(); placeAt(player, 33, 9, 0)")
        fight_nearest(page)
        shot(page, "05-combat", 0)

        new_character(page, "Ember", "invoker")
        buff(page, 14)
        stage(page, "placeAt(player, 22, 10, 1)")
        fight_nearest(page, 1500)
        stage(page, "castSpell('ignis orbis', performance.now())")
        shot(page, "06-cave-spell", 350)

        new_character(page, "Reed", "ranger")
        buff(page, 20)
        stage(page, "placeAt(player, 17, 12, 10)")
        shot(page, "07-saltmarsh")

        browser.close()


if __name__ == "__main__":
    main()

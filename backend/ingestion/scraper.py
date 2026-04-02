import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import logging

logger = logging.getLogger(__name__)


async def scrape_site(
    base_url: str, max_pages: int = 50, timeout: int = 15
) -> list[dict]:
    """
    Crawl a website and extract text content from each page.
    Returns a list of dicts with 'url', 'title', and 'text' keys.
    """
    visited: set[str] = set()
    to_visit: list[str] = [base_url]
    pages: list[dict] = []
    domain = urlparse(base_url).netloc

    # Normalize base URL
    if not base_url.startswith(("http://", "https://")):
        base_url = f"https://{base_url}"

    headers = {
        "User-Agent": "WonderChat Bot/1.0 (content indexing for AI assistant)"
    }

    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=timeout,
        headers=headers,
    ) as client:
        while to_visit and len(visited) < max_pages:
            url = to_visit.pop(0)

            # Normalize URL (remove fragments)
            url = url.split("#")[0]
            if url in visited:
                continue

            visited.add(url)

            try:
                resp = await client.get(url)
                content_type = resp.headers.get("content-type", "")
                if "text/html" not in content_type:
                    continue
            except Exception as e:
                logger.warning(f"Failed to fetch {url}: {e}")
                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract title
            title_tag = soup.find("title")
            title = title_tag.get_text(strip=True) if title_tag else ""

            # Remove non-content elements
            for tag in soup(
                ["script", "style", "nav", "footer", "header", "aside", "iframe", "noscript"]
            ):
                tag.decompose()

            # Extract main content (prefer <main> or <article> if available)
            main = soup.find("main") or soup.find("article") or soup.find("body")
            if not main:
                continue

            text = main.get_text(separator="\n", strip=True)

            # Skip near-empty pages
            if len(text) > 100:
                pages.append({"url": url, "title": title, "text": text})
                logger.info(f"Scraped: {url} ({len(text)} chars)")

            # Find internal links
            for a in soup.find_all("a", href=True):
                href = a["href"]

                # Skip mailto, tel, javascript, anchor-only links
                if href.startswith(("mailto:", "tel:", "javascript:", "#")):
                    continue

                link = urljoin(url, href).split("#")[0]
                parsed = urlparse(link)

                # Only follow same-domain links
                if parsed.netloc == domain and link not in visited:
                    # Skip common non-content paths
                    skip_extensions = (
                        ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg",
                        ".css", ".js", ".ico", ".xml", ".zip",
                    )
                    if not any(parsed.path.lower().endswith(ext) for ext in skip_extensions):
                        to_visit.append(link)

    logger.info(f"Scraping complete: {len(pages)} pages from {domain}")
    return pages

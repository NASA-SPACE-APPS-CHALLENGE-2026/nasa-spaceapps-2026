# Landing page image slots

Put image files here, then set the matching path in [`content/site.ts`](../../content/site.ts). Until a path is set, each slot shows a drawn placeholder: aerial rows, center pivots, tractor ruts, drainage lines or contour strips. No stock or copied photos are used.

Use your own photos or renders, or ones you have the rights to.

| File (suggested) | `site.ts` field | Shown in | Shape |
|---|---|---|---|
| `hero-satellite.jpg` | `hero.assets.satellite` | Hero, 0–30%. If set, it is also used as the 3D ground texture | Landscape, ≥ 2400 px wide, top-down |
| `hero-field.jpg` | `hero.assets.field` | Hero, 30–55% | Landscape, ≥ 2400 px |
| `hero-rows.jpg` | `hero.assets.rows` | Hero, 55–80%. Also the reduced-motion hero image | Landscape, ≥ 2400 px |
| `hero-soil.jpg` | `hero.assets.soil` | Hero, 80–100% | Landscape, ≥ 2400 px |
| `solutions-map.jpg` | `solutions.cards[0].image` | "What you can do", card 1 | Portrait 4:5 |
| `solutions-rotation.jpg` | `solutions.cards[1].image` | Card 2 | Portrait 4:5 |
| `solutions-profit.jpg` | `solutions.cards[2].image` | Card 3 | Portrait 4:5 |
| `story-1.jpg`, `story-2.jpg` | `stories.items[n].image` | Success story cards | 16:10 |
| `news-1.jpg` | `latest.item.image` | Latest card | 4:3 or wider |
| `footer-field.jpg` | `footer.image` | Behind the footer wordmark (it is darkened) | Landscape, dark field photo |

How the hero stills work:

- Set any of the four hero stills and they cross-fade over the 3D scene at their stage.
- Set all four and the 3D scene isn't loaded at all.

Images load through `next/image` (lazy, resized). Only `hero-satellite` loads eagerly.

# MaiBot WebUI scrollbar appearance

`scrollbars.css` is an unchanged excerpt of the native scrollbar section in MaiBot WebUI's `dashboard/src/styles/millennium.css`, from file commit `4ef9e14bdd45cf3b7d0fa1921abe5a5566be7768`.

Source: <https://github.com/Mai-with-u/MaiBot/blob/4ef9e14bdd45cf3b7d0fa1921abe5a5566be7768/dashboard/src/styles/millennium.css>

The upstream GNU GPL version 3 license is retained in `LICENSE`.

`app/maibot-scrollbars.css` uses the same excerpt. Its only adaptations are:

- `:root[data-dashboard-style='millennium'] *` becomes `:is(:root, :root *)`, including this site's document scrollbar as well as inner scroll containers.
- The existing `--mil-drop`, `--mil-shell`, `--mil-lo`, `--mil-line`, and `--mil-bevel` tokens map to this site's equivalent tokens without the `mil-` prefix.
- At the user's request, `--mil-key` and `--mil-key-hover` map to `--scrollbar-key` and `--scrollbar-key-hover`. These local tokens mix the original key colors with 5% black, slightly dimming only scrollbar fills in both themes.
- At the user's further request, inner scrollbar backgrounds, all tracks and corners are transparent, and the upstream track inset shadow is removed. This lets each page/panel/input surface show through instead of painting a shell-colored strip over different backgrounds. The root canvas and native viewport scrollbar repeat the existing desktop texture, because native viewport transparency exposes the canvas color but not its background image; the tile origin aligns with the desktop.

Other declaration bodies retain the upstream appearance, including thumb size, border and bevel. There is no added active/pressed color. The site's existing hidden tab scrollbar and layout gutter policies remain outside this appearance file.

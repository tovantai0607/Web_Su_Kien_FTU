/** Aurora Background adapted from Aceternity's free registry component.
 * https://ui.aceternity.com/registry/aurora-background.json
 * Local CSS uses transform instead of continuously repainting background-position.
 * See docs/frontend-upgrade.md for source and licence. */
export function Aurora() {
  return (
    <div className="aurora-background" aria-hidden="true">
      <div className="aurora-light" />
    </div>
  );
}

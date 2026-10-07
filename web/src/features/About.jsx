const D = ({ t, open, children }) => <details open={open}><summary>{t}</summary>{children}</details>;

export default function About() {
  return (
    <div className="pn" style={{ maxWidth: 760, margin: 'auto' }}>
      <h2>About SafeRoute</h2>
      <D t="Problem" open><p>Students, women, night-shift workers and pedestrians can feel unsafe after dark or in unfamiliar areas. Standard maps optimize for time and distance, not lighting, active spaces, help points or verified reports.</p></D>
      <D t="How it works" open><ol>
        <li>Choose a destination and travel mode (walking, cycling or campus ride).</li>
        <li>The app scores each route using lighting, verified reports, nearby help points and time of day.</li>
        <li>You see Fastest, Safest and Balanced options with plain explanations.</li>
        <li>During the trip you can share location, check in, report an issue or trigger SOS.</li>
        <li>Institutions use anonymized trends to improve lighting, maintenance and patrols.</li></ol></D>
      <D t="Who it is for"><p>College students, women travelling alone, night-shift employees, new visitors, parents or guardians who receive consent-based safe-arrival notifications, and campus security teams.</p></D>
      <D t="90-day pilot"><p>One campus and nearby student housing. Map 20 to 30 common routes, add official security and help locations, recruit 100 to 200 volunteers, and review reports with campus security.</p></D>
      <D t="Success metrics"><ul>
        <li>Safety-route journeys completed</li><li>Share of users reporting more confidence</li><li>Time to review and resolve reports</li>
        <li>Unsafe infrastructure issues found and fixed</li><li>Safe Walk use and safe-arrival confirmations</li></ul></D>
      <D t="Safety, ethics and privacy"><p>Never label a route completely safe. Prevent misuse with report moderation, rate limits and verification. Protect location data with consent, minimal collection, clear retention rules and an immediate stop-sharing control.</p></D>
      <div className="note">SafeRoute helps people choose a safer way home by combining route guidance, trusted contacts, verified campus information and privacy-first emergency support.</div>
    </div>
  );
}

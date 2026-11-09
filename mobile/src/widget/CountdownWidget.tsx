import { FlexWidget, ListWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { UNIT_WORD, feedItems, isDone, remainingParts, updatedText, type CachedFeed, type FeedItem, type Part } from '../feed';
import type { ThemeName } from '../theme';
import { hidiSvg } from './hidi';

export const WIDGET_NAME = 'Countdown';

// The widget's size in dp; not needed for the layout yet (the list scrolls at any size).
type Size = { width: number; height: number };

type Props =
  | { state: 'ready'; cached: CachedFeed; stale?: string; theme: ThemeName; size: Size }
  | { state: 'empty' | 'error'; message?: string; theme: ThemeName; size: Size };

/**
 * The widget's colors per app theme (mobile/src/theme.ts, which copies the website's tokens):
 * a bold teal gradient with white cards for Teal Paper, deep graphite with teal accents for Graphite.
 */
const LOOKS = {
  teal: {
    from: '#2e7c7f',
    to: '#63c1bb',
    onBg: '#ffffff',
    onBgSoft: 'rgba(255, 255, 255, 0.82)',
    pill: 'rgba(255, 255, 255, 0.22)',
    card: '#ffffff',
    chip: '#e2f0ee',
    title: '#1b2a2c',
    muted: '#5e6f72',
    number: '#105f68',
    done: '#3a9295',
  },
  graphite: {
    from: '#1c2123',
    to: '#1d3434',
    onBg: '#f3f6f6',
    onBgSoft: 'rgba(243, 246, 246, 0.7)',
    pill: 'rgba(92, 189, 182, 0.2)',
    card: '#253033',
    chip: '#1d3434',
    title: '#e8eded',
    muted: '#8f9b9c',
    number: '#5cbdb6',
    done: '#5cbdb6',
  },
} as const;
type Look = (typeof LOOKS)[ThemeName];

// One friendly badge per countdown kind (src/lib/countdown-kinds.ts on the website).
const KIND_BADGE: Record<string, string> = {
  exam: '📝',
  graduation: '🎓',
  birthday: '🎂',
  wedding: '💍',
  work: '💼',
  trip: '✈️',
  life: '🌱',
  deadline: '⏳',
};

/**
 * The home-screen widget: every countdown still to come, in one widget, as a list you scroll
 * through (starred first, then soonest). A single countdown gets one big hero card instead. Drawn to
 * native Android views (RemoteViews) by react-native-android-widget, so only its primitives work here.
 */
export function CountdownWidget(props: Props) {
  const look = LOOKS[props.theme];
  const items = props.state === 'ready' ? feedItems(props.cached.feed) : [];
  const tz = props.state === 'ready' ? props.cached.feed.timeZone : undefined;
  const now = Date.now();
  const toGo = items.filter((i) => !isDone(i, now)).length;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="hidl countdowns"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: { from: look.from, to: look.to, orientation: 'TL_BR' },
        borderRadius: 28,
        padding: 12,
        flexDirection: 'column',
      }}
    >
      <Header look={look} right={props.state === 'ready' && items.length > 0 ? (toGo === 1 ? '1 to go' : `${toGo} to go`) : null} />

      {props.state !== 'ready' || items.length === 0 ? (
        <Message
          look={look}
          title={props.state === 'error' ? props.message ?? "Couldn't load your countdowns" : 'No countdowns yet'}
          hint={props.state === 'error' ? 'Tap to open hidl' : props.state === 'empty' ? 'Tap to open hidl and connect' : 'Tap to add one in hidl'}
        />
      ) : items.length > 1 ? (
        // The list takes only the room under the header (flex), so its last card isn't cut off.
        <FlexWidget style={{ flex: 1, width: 'match_parent', marginTop: 8 }}>
          <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
            {items.map((item, i) => (
              <Row key={item.id ?? i} item={item} look={look} tz={tz} now={now} />
            ))}
          </ListWidget>
        </FlexWidget>
      ) : (
        <Hero item={items[0]} look={look} tz={tz} now={now} />
      )}

      {props.state === 'ready' && items.length === 1 && (
        <TextWidget
          text={props.stale ?? updatedText(props.cached.fetchedAt)}
          maxLines={1}
          style={{ fontSize: 11, color: look.onBgSoft, marginTop: 6 }}
        />
      )}
    </FlexWidget>
  );
}

function Header({ look, right }: { look: Look; right: string | null }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
      <SvgWidget svg={hidiSvg()} style={{ width: 30, height: 31 }} />
      <TextWidget text="hidl" style={{ fontSize: 18, fontWeight: 'bold', color: look.onBg, marginLeft: 6, letterSpacing: 0.02 }} />
      <FlexWidget style={{ flex: 1 }} />
      {right && (
        <FlexWidget style={{ backgroundColor: look.pill, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
          <TextWidget text={right} style={{ fontSize: 12, fontWeight: 'bold', color: look.onBg }} />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

/** The first countdown, big: for a small widget, or when there's only one. */
function Hero({ item, look, tz, now }: { item: FeedItem; look: Look; tz?: string; now: number }) {
  const done = isDone(item, now);
  const parts = remainingParts(item, tz, now);
  const [lead, ...rest] = parts;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: 'match_parent',
        flex: 1,
        marginTop: 8,
        backgroundColor: look.card,
        borderRadius: 20,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Badge kind={item.kind} look={look} size={46} />
      <FlexWidget style={{ flex: 1, marginLeft: 10, flexDirection: 'column' }}>
        <TextWidget text={titleOf(item)} maxLines={1} truncate="END" style={{ fontSize: 15, fontWeight: 'bold', color: look.title }} />
        {done ? (
          <TextWidget text="It's here! 🎉" style={{ fontSize: 26, fontWeight: 'bold', color: look.done }} />
        ) : (
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <TextWidget text={String(lead?.value ?? 0)} style={{ fontSize: 34, fontWeight: 'bold', color: look.number }} />
            <TextWidget
              text={` ${lead ? word(lead) : 'soon'}${rest.length ? ` ${rest.map(short).join(' ')}` : ''}`}
              maxLines={1}
              style={{ fontSize: 14, fontWeight: 'bold', color: look.muted, marginBottom: 6 }}
            />
          </FlexWidget>
        )}
        <TextWidget
          text={dateOf(item, tz)}
          maxLines={1}
          style={{ fontSize: 12, color: look.muted }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

/** One countdown in the scrolling list. */
function Row({ item, look, tz, now }: { item: FeedItem; look: Look; tz?: string; now: number }) {
  const done = isDone(item, now);
  const parts = remainingParts(item, tz, now);
  const [lead, ...rest] = parts;
  return (
    <FlexWidget style={{ width: 'match_parent', paddingBottom: 8 }}>
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          width: 'match_parent',
          backgroundColor: look.card,
          borderRadius: 18,
          paddingHorizontal: 10,
          paddingVertical: 9,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Badge kind={item.kind} look={look} size={40} />
        <FlexWidget style={{ flex: 1, marginLeft: 10, flexDirection: 'column' }}>
          <TextWidget text={titleOf(item)} maxLines={1} truncate="END" style={{ fontSize: 14, fontWeight: 'bold', color: look.title }} />
          <TextWidget text={dateOf(item, tz)} maxLines={1} style={{ fontSize: 11, color: look.muted }} />
        </FlexWidget>
        {/* No fragments (<>…</>) anywhere in a widget: the library can't convert them. */}
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end', marginLeft: 8 }}>
          <TextWidget
            text={done ? '🎉' : String(lead?.value ?? 0)}
            style={{ fontSize: done ? 22 : 24, fontWeight: 'bold', color: look.number }}
          />
          <TextWidget
            text={done ? "it's here" : lead ? `${word(lead)}${rest.length ? ` ${rest.map(short).join(' ')}` : ''}` : 'soon'}
            maxLines={1}
            style={{ fontSize: 11, fontWeight: 'bold', color: look.muted }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

function Badge({ kind, look, size }: { kind: string; look: Look; size: number }) {
  return (
    <FlexWidget
      style={{
        width: size,
        height: size,
        borderRadius: size / 2.6,
        backgroundColor: look.chip,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <TextWidget text={KIND_BADGE[kind] ?? '⭐'} style={{ fontSize: size * 0.46 }} />
    </FlexWidget>
  );
}

function Message({ look, title, hint }: { look: Look; title: string; hint: string }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
      <SvgWidget svg={hidiSvg('cheer')} style={{ width: 58, height: 60 }} />
      <FlexWidget style={{ flex: 1, marginLeft: 10, flexDirection: 'column' }}>
        <TextWidget text={title} maxLines={2} style={{ fontSize: 15, fontWeight: 'bold', color: look.onBg }} />
        <TextWidget text={hint} maxLines={2} style={{ fontSize: 12, color: look.onBgSoft, marginTop: 2 }} />
      </FlexWidget>
    </FlexWidget>
  );
}

function titleOf(item: FeedItem) {
  return item.starred ? `⭐ ${item.title}` : item.title;
}

function word(p: Part) {
  return UNIT_WORD[p.unit][p.value === 1 ? 0 : 1];
}

function short(p: Part) {
  return `${p.value}${p.unit === 'months' ? 'mo' : p.unit[0]}`;
}

/** "Thu, Nov 12" in the owner's zone; plain if this phone can't format time zones. */
function dateOf(item: FeedItem, tz?: string) {
  const d = new Date(item.targetAt);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
  } catch {
    return d.toDateString().slice(0, 10);
  }
}

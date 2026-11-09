import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { UNIT_WORD, feedItems, isDone, remainingParts, updatedText, type CachedFeed, type FeedItem, type Part } from '../feed';
import type { ThemeName } from '../theme';
import { hidiSvg } from './hidi';

export const WIDGET_NAME = 'Countdown';

/** clickAction names for the ‹ › buttons, handled in task-handler.tsx. */
export const PREV = 'PREV_COUNTDOWN';
export const NEXT = 'NEXT_COUNTDOWN';

// The widget's size in dp: a tall widget stacks the countdown with a bigger number.
type Size = { width: number; height: number };

type Props =
  | { state: 'ready'; cached: CachedFeed; stale?: string; theme: ThemeName; size: Size; page?: number }
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
 * The home-screen widget: every countdown still to come, one at a time, big. ‹ › in the header
 * flip to the previous or next (starred first, then soonest), and "1 / 3" says how many there are.
 * Drawn to native Android views (RemoteViews) by react-native-android-widget, so only its
 * primitives work here.
 */
export function CountdownWidget(props: Props) {
  const look = LOOKS[props.theme];
  const items = props.state === 'ready' ? feedItems(props.cached.feed) : [];
  const tz = props.state === 'ready' ? props.cached.feed.timeZone : undefined;
  const now = Date.now();
  const count = items.length;
  // Wraps around, so ‹ on the first shows the last; a page past the end (one was deleted) wraps too.
  const page = count > 0 && props.state === 'ready' ? (((props.page ?? 0) % count) + count) % count : 0;
  const tall = props.size.height >= 165;

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
      <Header look={look} page={page} count={props.state === 'ready' ? count : 0} />

      {props.state !== 'ready' || count === 0 ? (
        <Message
          look={look}
          title={props.state === 'error' ? props.message ?? "Couldn't load your countdowns" : 'No countdowns yet'}
          hint={props.state === 'error' ? 'Tap to open hidl' : props.state === 'empty' ? 'Tap to open hidl and connect' : 'Tap to add one in hidl'}
        />
      ) : (
        <Hero item={items[page]} look={look} tz={tz} now={now} tall={tall} />
      )}

      {props.state === 'ready' && count > 0 && tall && (
        <TextWidget
          text={props.stale ?? updatedText(props.cached.fetchedAt)}
          maxLines={1}
          style={{ fontSize: 11, color: look.onBgSoft, marginTop: 6 }}
        />
      )}
    </FlexWidget>
  );
}

function Header({ look, page, count }: { look: Look; page: number; count: number }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
      <SvgWidget svg={hidiSvg()} style={{ width: 30, height: 31 }} />
      <TextWidget text="hidl" style={{ fontSize: 18, fontWeight: 'bold', color: look.onBg, marginLeft: 6, letterSpacing: 0.02 }} />
      <FlexWidget style={{ flex: 1 }} />
      {count > 1 ? (
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: look.pill, borderRadius: 16 }}>
          <Arrow look={look} action={PREV} glyph="‹" label="Previous countdown" />
          <TextWidget text={`${page + 1} / ${count}`} style={{ fontSize: 13, fontWeight: 'bold', color: look.onBg }} />
          <Arrow look={look} action={NEXT} glyph="›" label="Next countdown" />
        </FlexWidget>
      ) : count === 1 ? (
        <FlexWidget style={{ backgroundColor: look.pill, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
          <TextWidget text="1 to go" style={{ fontSize: 12, fontWeight: 'bold', color: look.onBg }} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

/** A ‹ or › button: a generous tap area, since thumbs are bigger than the glyph. */
function Arrow({ look, action, glyph, label }: { look: Look; action: string; glyph: string; label: string }) {
  return (
    <FlexWidget
      clickAction={action}
      accessibilityLabel={label}
      style={{ width: 40, height: 32, justifyContent: 'center', alignItems: 'center' }}
    >
      <TextWidget text={glyph} style={{ fontSize: 24, fontWeight: 'bold', color: look.onBg }} />
    </FlexWidget>
  );
}

/** The countdown on show. Tall widgets stack it with a bigger number; short ones keep it in a row. */
function Hero({ item, look, tz, now, tall }: { item: FeedItem; look: Look; tz?: string; now: number; tall: boolean }) {
  const done = isDone(item, now);
  const [lead, ...rest] = remainingParts(item, tz, now);
  const unitText = lead ? `${word(lead)}${rest.length ? ` ${rest.map(short).join(' ')}` : ''}` : 'soon';
  const number = (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <TextWidget
        text={done ? '🎉' : String(lead?.value ?? 0)}
        style={{ fontSize: tall ? 52 : 34, fontWeight: 'bold', color: look.number }}
      />
      <TextWidget
        text={done ? " It's here!" : ` ${unitText}`}
        maxLines={1}
        style={{ fontSize: tall ? 17 : 14, fontWeight: 'bold', color: done ? look.done : look.muted, marginBottom: tall ? 10 : 6 }}
      />
    </FlexWidget>
  );
  const heading = (
    <FlexWidget style={{ flex: 1, marginLeft: 10, flexDirection: 'column' }}>
      <TextWidget text={titleOf(item)} maxLines={1} truncate="END" style={{ fontSize: tall ? 17 : 15, fontWeight: 'bold', color: look.title }} />
      <TextWidget text={dateOf(item, tz)} maxLines={1} style={{ fontSize: 12, color: look.muted }} />
    </FlexWidget>
  );
  const card = {
    width: 'match_parent' as const,
    flex: 1,
    marginTop: 8,
    backgroundColor: look.card,
    borderRadius: 22,
    padding: 12,
  };

  if (tall) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ ...card, flexDirection: 'column', justifyContent: 'space-between' }}>
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
          <Badge kind={item.kind} look={look} size={46} />
          {heading}
        </FlexWidget>
        {number}
      </FlexWidget>
    );
  }
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ ...card, flexDirection: 'row', alignItems: 'center' }}>
      <Badge kind={item.kind} look={look} size={46} />
      <FlexWidget style={{ flex: 1, marginLeft: 10, flexDirection: 'column' }}>
        <TextWidget text={titleOf(item)} maxLines={1} truncate="END" style={{ fontSize: 15, fontWeight: 'bold', color: look.title }} />
        {number}
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

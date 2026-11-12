import { FlexWidget, ListWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { FONT, LOOKS, skinFor, type Look, type LookName } from './look';
import { editSvg, hidiHeight, hidiSvg, kindSvg } from './hidi';
import { describe, type Mood, type Shown, type WidgetCountdown } from './mood';

/** The three entries in the widget picker (app.json). "Countdown" is the original, kept so
 *  widgets already on home screens keep working; it's the medium one. */
export const WIDGET_NAMES = ['CountdownSmall', 'CountdownTall', 'Countdown', 'CountdownLarge'] as const;
export const WIDGET_NAME = 'Countdown';

/** The sizes this app can place (the page offers these). 2×3 ("tall") came with app version 0.5.0. */
export const PIN_SIZES = ['small', 'tall', 'medium', 'large'] as const;

/** The picker entry for a size the page asks for; medium otherwise. */
export function widgetNameForSize(size: unknown): (typeof WIDGET_NAMES)[number] {
  if (size === 'small') return 'CountdownSmall';
  if (size === 'tall') return 'CountdownTall';
  if (size === 'large') return 'CountdownLarge';
  return 'Countdown';
}

/** clickAction names from older widget versions, still handled in task-handler.tsx (a widget
 *  drawn by an older version keeps its buttons until it's redrawn). */
export const PREV = 'PREV_COUNTDOWN';
export const NEXT = 'NEXT_COUNTDOWN';
export const SELECT = 'SELECT_COUNTDOWN';

/**
 * A tap on a card: the APK's patched widget library (mobile/patches/) flips the card stack itself,
 * with a slide, without waking the app. Older APKs pass it to task-handler.tsx, which redraws
 * with the next countdown on top instead.
 */
export const FLIP_NEXT = 'HIDL_FLIP_NEXT';

export type Size = { width: number; height: number };
export type WidgetItem = WidgetCountdown & { id?: string };

type Common = { size: Size; look: LookName; widgetId?: number };
export type WidgetProps =
  | (Common & {
      state: 'ready';
      /** In the order shown: the one on top first (see `smartOrder`). */
      items: WidgetItem[];
      /** Each item's place soonest-first, for the dots (the stack may start mid-way). */
      positions?: number[];
      tz?: string;
      now: number;
      stale?: boolean;
    })
  | (Common & { state: 'empty'; connected: boolean; nonePicked?: boolean })
  | (Common & { state: 'error'; message: string });

/**
 * The size breakpoints: what's drawn depends on the widget's real size, so any of the three
 * picker entries stays readable when resized.
 */
export function layoutFor(size: Size): 'small' | 'tall' | 'medium' | 'large' {
  if (size.width < 230) return size.height >= 230 ? 'tall' : 'small';
  if (size.height >= 280) return 'large';
  return 'medium';
}

/** Opens the website page for one countdown in the app (App.tsx handles hidl://open). */
export function countdownUri(id?: string) {
  return `hidl://open?path=${encodeURIComponent(id ? `/countdown#c-${id}` : '/countdown')}`;
}

/** Opens this widget's settings in the app: which countdowns it shows, and its look (App.tsx). */
export function settingsUri(widgetId?: number) {
  return widgetId === undefined ? 'hidl://widget' : `hidl://widget?id=${widgetId}`;
}

/**
 * The Hidl home-screen widget, a stack of cards: every countdown fills the whole widget, the
 * soonest on top (`smartOrder` in mood.ts), and a tap slides the next one up. The `ListWidget` is drawn by Android's AdapterViewFlipper, not a
 * scrolling list: mobile/patches/ swaps it in the widget library, with the slide and the tap
 * (`FLIP_NEXT`) handled natively, so it works on every launcher. Each card is one huge
 * number, what it's for, a thin bar of how far along it is, and Hidi, whose mood follows the date
 * and colors the card (gold on the day, slate once it's passed). The large size is a list.
 *
 * Drawn to pictures by react-native-android-widget, so only its primitives work here (no React
 * Native views, no fragments), and nothing ticks between redraws.
 */
export function CountdownWidget(props: WidgetProps) {
  const look = LOOKS[props.look];
  const layout = layoutFor(props.size);

  let body: React.JSX.Element;
  if (props.state !== 'ready' || props.items.length === 0) {
    body = <EmptyCard look={look} small={layout === 'small' || layout === 'tall'} props={props} />;
  } else if (layout === 'large') {
    body = <LargeList look={look} props={props} />;
  } else {
    const { items, now, tz } = props;
    body = (
      <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
        {items.map((item, i) => {
          const page = {
            look,
            item,
            shown: describe(item, now, tz),
            index: props.positions?.[i] ?? i,
            count: items.length,
            tz,
            widgetId: props.widgetId,
            stale: props.stale,
            width: props.size.width,
            height: props.size.height,
          };
          const key = item.id ?? `${item.title}-${i}`;
          if (layout === 'small') return <SmallPage key={key} {...page} />;
          if (layout === 'tall') return <TallPage key={key} {...page} />;
          return <MediumPage key={key} {...page} />;
        })}
      </ListWidget>
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Hidl countdowns"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        borderRadius: 28,
        backgroundGradient: { from: look.from, to: look.to, orientation: 'TL_BR' },
        flexDirection: 'column',
      }}
    >
      {body}
    </FlexWidget>
  );
}

// ---- building blocks

type PageProps = {
  look: Look;
  item: WidgetItem;
  shown: Shown;
  index: number;
  count: number;
  tz?: string;
  widgetId?: number;
  stale?: boolean;
  width: number;
  height: number;
};

/**
 * One countdown's card: fills the stack, in its mood's colors. A tap flips to the next one; the
 * title and Hidi (`Opens`) open the countdown. With only one, the whole card opens it.
 */
function Page({ look, item, shown, padding, count, children }: {
  look: Look; item: WidgetItem; shown: Shown; padding: number | { v: number; h: number }; count: number; children: React.ReactNode;
}) {
  const pad = typeof padding === 'number' ? { paddingVertical: padding, paddingHorizontal: padding } : { paddingVertical: padding.v, paddingHorizontal: padding.h };
  const skin = skinFor(look, shown.mood);
  return (
    <FlexWidget
      clickAction={count > 1 ? FLIP_NEXT : 'OPEN_URI'}
      clickActionData={count > 1 ? { id: item.id ?? '' } : { uri: countdownUri(item.id) }}
      accessibilityLabel={`${item.title}: ${shown.short}`}
      style={{
        width: 'match_parent',
        height: 'match_parent',
        borderRadius: 28,
        backgroundGradient: { from: skin.from, to: skin.to, orientation: 'TL_BR' },
        ...pad,
        flexDirection: 'column',
      }}
    >
      {children}
    </FlexWidget>
  );
}

/** Opens this countdown in the app (inside a card, where a tap elsewhere flips). */
function Opens({ item, children, flex }: { item: WidgetItem; children: React.ReactNode; flex?: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: countdownUri(item.id) }}
      accessibilityLabel={`Open ${item.title}`}
      style={{ flexDirection: 'column', ...(flex ? { flex } : {}) }}
    >
      {children}
    </FlexWidget>
  );
}

function Hidi({ mood, width }: { mood: Mood; width: number }) {
  return <SvgWidget svg={hidiSvg(mood)} style={{ width, height: hidiHeight(width) }} />;
}

function Text({ text, size, color, font = FONT.round, lines = 1, align, marginTop, marginLeft, flex }: {
  text: string; size: number; color: string; font?: string; lines?: number; align?: 'left' | 'center' | 'right'; marginTop?: number; marginLeft?: number; flex?: number;
}) {
  return (
    <TextWidget
      text={text}
      maxLines={lines}
      truncate="END"
      allowFontScaling={false}
      style={{
        fontSize: size,
        color: color as `#${string}`,
        fontFamily: font,
        ...(align ? { textAlign: align } : {}),
        ...(marginTop ? { marginTop } : {}),
        ...(marginLeft ? { marginLeft } : {}),
        ...(flex ? { flex } : {}),
      }}
    />
  );
}

/** A round glass button with the sliders icon: this widget's settings (which countdowns, look). */
function EditButton({ look, widgetId, size = 32 }: { look: Look; widgetId?: number; size?: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: settingsUri(widgetId) }}
      accessibilityLabel="Choose countdowns for this widget"
      // A tap area bigger than the button, so it's easy to hit.
      style={{ width: size + 12, height: size + 12, justifyContent: 'center', alignItems: 'center' }}
    >
      <FlexWidget
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: look.glass,
          borderColor: look.glassLine,
          borderWidth: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <SvgWidget svg={editSvg(look.text)} style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** Where you are in the stack, standing up, so it says "scroll up and down". */
function StackDots({ look, count, index, k = 1 }: { look: Look; count: number; index: number; k?: number }) {
  if (count < 2) return null;
  if (count > 7) return <Text text={`${index + 1}/${count}`} size={Math.round(10 * k)} color={look.soft} font={FONT.mono} />;
  const w = Math.max(4, Math.round(5 * k));
  return (
    <FlexWidget style={{ flexDirection: 'column', alignItems: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <FlexWidget
          key={i}
          style={{ width: w, height: i === index ? Math.round(13 * k) : w, borderRadius: w / 2, marginVertical: Math.round(2 * k), backgroundColor: i === index ? look.dot : look.dotOff }}
        />
      ))}
    </FlexWidget>
  );
}

/** The big number with its units beside it: "3" days / 20h; a word on the day itself. */
function BigNumber({ look, shown, size }: { look: Look; shown: Shown; size: number }) {
  const [unit, ...rest] = shown.chips;
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text text={shown.big} size={shown.bigIsWord ? Math.round(size * 0.6) : size} color={look.text} font={FONT.roundHeavy} />
      {unit && (
        <FlexWidget style={{ flexDirection: 'column', marginLeft: Math.round(size * 0.15) }}>
          <Text text={unit} size={Math.round(size * 0.3)} color={look.text} font={FONT.roundHeavy} />
          {rest.length > 0 && <Text text={rest.slice(0, 2).join(' ')} size={Math.round(size * 0.25)} color={look.soft} />}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

/** A thin white bar: how far from "made" to "the day". */
function Bar({ look, progress, height = 6, marginTop = 10 }: { look: Look; progress: number | null; height?: number; marginTop?: number }) {
  if (progress === null) return null;
  const filled = Math.max(Math.round(progress * 1000), 30);
  return (
    <FlexWidget style={{ width: 'match_parent', height, marginTop, backgroundColor: look.track, borderRadius: height / 2, flexDirection: 'row' }}>
      <FlexWidget style={{ flex: filled, height, backgroundColor: look.fill, borderRadius: height / 2 }} />
      {filled < 1000 && <FlexWidget style={{ flex: 1000 - filled, height }} />}
    </FlexWidget>
  );
}

/** Hidi's line, in a white bubble. */
function Bubble({ look, text, size = 13, lines = 1 }: { look: Look; text: string; size?: number; lines?: number }) {
  return (
    <FlexWidget
      style={{
        backgroundColor: look.bubble,
        borderRadius: Math.round(size * 1.1),
        paddingHorizontal: Math.round(size * 0.82),
        paddingVertical: Math.round(size * 0.3),
      }}
    >
      <Text text={text} size={size} color={look.bubbleText} lines={lines} />
    </FlexWidget>
  );
}

/** The prototype's proportions (a 300×150 medium, a 170×170 small) scaled to the real size. */
const scale = (actual: number, designed: number) => Math.max(0.75, Math.min(1.5, actual / designed));

// ---- the layouts

/**
 * 4×2: Hidi's line on top; the big number with its units, the title, and the kind and date on the
 * left; Hidi on the right with the stack dots at the edge; the bar along the bottom. Sized from the
 * prototype (300×150), so it keeps the same balance on any phone.
 */
function MediumPage({ look, item, shown, index, count, tz, stale, width, height }: PageProps) {
  const k = Math.min(scale(height, 150), scale(width, 300));
  const r = (n: number) => Math.round(n * k);
  return (
    <Page look={look} item={item} shown={shown} padding={{ v: r(12), h: r(14) }} count={count}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row' }}>
        <Bubble look={look} text={stale ? 'Offline: counting from my last look.' : speech(shown)} size={r(11)} />
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <BigNumber look={look} shown={shown} size={r(40)} />
          <Opens item={item}>
            <Text text={item.title} size={r(14)} color={look.text} font={FONT.roundHeavy} />
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: r(2) }}>
              <SvgWidget svg={kindSvg(item.kind)} style={{ width: r(15), height: r(15) }} />
              <Text text={dateOf(item.targetAt, tz)} size={r(11)} color={look.soft} marginLeft={r(5)} />
            </FlexWidget>
          </Opens>
        </FlexWidget>
        <Opens item={item}>
          <Hidi mood={shown.mood} width={r(64)} />
        </Opens>
        {count > 1 && (
          <FlexWidget style={{ marginLeft: r(10) }}>
            <StackDots look={look} count={count} index={index} k={k} />
          </FlexWidget>
        )}
      </FlexWidget>

      <Bar look={look} progress={shown.progress} height={r(5)} marginTop={r(4)} />
    </Page>
  );
}

/**
 * 2×2: the kind and the stack dots on top, the big number beside Hidi, then the title and its
 * units, and the bar. Sized from a 170×170 design.
 */
function SmallPage({ look, item, shown, index, count, width, height }: PageProps) {
  const k = scale(Math.min(width, height), 170);
  const r = (n: number) => Math.round(n * k);
  return (
    <Page look={look} item={item} shown={shown} padding={r(14)} count={count}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'row' }}>
          <SvgWidget svg={kindSvg(item.kind)} style={{ width: r(22), height: r(22) }} />
        </FlexWidget>
        {count > 1 && <StackDots look={look} count={count} index={index} k={k * 0.9} />}
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flex: 1 }}>
          <Text text={shown.big} size={shown.bigIsWord ? r(24) : r(46)} color={look.text} font={FONT.roundHeavy} />
        </FlexWidget>
        <Opens item={item}>
          <Hidi mood={shown.mood} width={r(62)} />
        </Opens>
      </FlexWidget>
      <Opens item={item}>
        <Text text={item.title} size={r(14)} color={look.text} font={FONT.roundHeavy} />
        {shown.chips.length > 0 && <Text text={shown.chips.slice(0, 2).join(' · ')} size={r(11)} color={look.soft} />}
      </Opens>
      <Bar look={look} progress={shown.progress} height={r(5)} marginTop={r(8)} />
    </Page>
  );
}

/**
 * 2×3: Hidi's line on top, Hidi big in the middle, then the number with its units, the title, the
 * kind and date, and the bar, all centered. Sized from a 170 wide design.
 */
function TallPage({ look, item, shown, index, count, tz, stale, width }: PageProps) {
  const k = scale(width, 170);
  const r = (n: number) => Math.round(n * k);
  return (
    <Page look={look} item={item} shown={shown} padding={r(14)} count={count}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'flex-start' }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'row' }}>
          {/* Just Hidi's line: the number is right below, and it has to fit two lines. */}
          <Bubble look={look} text={stale ? 'Offline for now.' : shown.line} size={r(11)} lines={2} />
        </FlexWidget>
        {count > 1 && (
          <FlexWidget style={{ marginLeft: r(6) }}>
            <StackDots look={look} count={count} index={index} k={k * 0.9} />
          </FlexWidget>
        )}
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Opens item={item}>
          <Hidi mood={shown.mood} width={r(84)} />
        </Opens>
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', alignItems: 'center' }}>
        <BigNumber look={look} shown={shown} size={r(40)} />
        <Opens item={item}>
          <Text text={item.title} size={r(14)} color={look.text} font={FONT.roundHeavy} align="center" />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: r(2) }}>
            <SvgWidget svg={kindSvg(item.kind)} style={{ width: r(14), height: r(14) }} />
            <Text text={dateOf(item.targetAt, tz)} size={r(11)} color={look.soft} marginLeft={r(5)} />
          </FlexWidget>
        </Opens>
      </FlexWidget>
      <Bar look={look} progress={shown.progress} height={r(5)} marginTop={r(10)} />
    </Page>
  );
}

/** 4×4: a header, the soonest as a big card with Hidi's bubble, then as many of the rest as fit. */
function LargeList({ look, props }: { look: Look; props: Extract<WidgetProps, { state: 'ready' }> }) {
  const { items, now, tz, widgetId, stale } = props;
  const [first, ...others] = items;
  // A fixed list (the stack view that small and medium swipe through can't scroll rows): as many
  // rows as fit under the big card (12 padding, 40 header, 4 gap, 170 card, 64 a row), then "+3 more".
  const fits = Math.max(0, Math.floor((props.size.height - 24 - 44 - 170) / 64));
  const rest = others.length > fits ? others.slice(0, Math.max(0, fits - 1)) : others;
  const more = others.length - rest.length;
  const shown = describe(first, now, tz);
  const skin = skinFor(look, shown.mood);
  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', padding: 12 }}>
      <FlexWidget style={{ width: 'match_parent', height: 40, flexDirection: 'row', alignItems: 'center', paddingLeft: 4 }}>
        <Hidi mood="calm" width={26} />
        <Text text="Hidl" size={18} color={look.text} font={FONT.roundHeavy} marginLeft={6} />
        <Text
          text={stale ? '· offline' : `· ${items.length} countdown${items.length === 1 ? '' : 's'}`}
          size={12}
          color={look.soft}
          marginLeft={6}
          flex={1}
        />
        <EditButton look={look} widgetId={widgetId} size={30} />
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flex: 1, marginTop: 4, flexDirection: 'column' }}>
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: countdownUri(first.id) }}
            style={{
              width: 'match_parent',
              height: 170,
              borderRadius: 22,
              backgroundGradient: { from: skin.from, to: skin.to, orientation: 'TL_BR' },
              borderColor: look.glassLine,
              borderWidth: 1,
              padding: 14,
              flexDirection: 'column',
            }}
          >
            <FlexWidget style={{ flexDirection: 'row' }}>
              <Bubble look={look} text={speech(shown)} />
            </FlexWidget>
            <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
                <BigNumber look={look} shown={shown} size={54} />
                <Text text={first.title} size={16} color={look.text} font={FONT.roundHeavy} />
                <Text text={dateOf(first.targetAt, tz)} size={12} color={look.soft} />
              </FlexWidget>
              <Hidi mood={shown.mood} width={84} />
            </FlexWidget>
            <Bar look={look} progress={shown.progress} marginTop={6} />
          </FlexWidget>
          {rest.map((item, i) => {
            const s = describe(item, now, tz);
            return (
              <FlexWidget
                key={item.id ?? `${item.title}-${i}`}
                clickAction="OPEN_URI"
                clickActionData={{ uri: countdownUri(item.id) }}
                style={{ width: 'match_parent', height: 64, paddingTop: 8, flexDirection: 'column' }}
              >
                <FlexWidget
                  style={{
                    width: 'match_parent',
                    height: 56,
                    borderRadius: 18,
                    backgroundColor: look.row,
                    paddingHorizontal: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <SvgWidget svg={kindSvg(item.kind)} style={{ width: 28, height: 28 }} />
                  <FlexWidget style={{ flex: 1, marginLeft: 10, flexDirection: 'column' }}>
                    <Text text={item.title} size={15} color={look.text} font={FONT.roundHeavy} />
                    <Text text={dateOf(item.targetAt, tz)} size={11} color={look.soft} />
                  </FlexWidget>
                  <Text text={s.big} size={s.bigIsWord ? 15 : 24} color={look.text} font={FONT.roundHeavy} marginLeft={8} />
                  {!s.bigIsWord && s.chips[0] && <Text text={s.chips[0]} size={11} color={look.soft} marginLeft={4} />}
                </FlexWidget>
              </FlexWidget>
            );
          })}
          {more > 0 && (
            <FlexWidget
              clickAction="OPEN_URI"
              clickActionData={{ uri: countdownUri() }}
              style={{ width: 'match_parent', height: 56, marginTop: 8, borderRadius: 18, backgroundColor: look.row, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text text={`+${more} more`} size={14} color={look.soft} font={FONT.roundHeavy} />
            </FlexWidget>
          )}
      </FlexWidget>
    </FlexWidget>
  );
}

function EmptyCard({ look, small, props }: { look: Look; small: boolean; props: WidgetProps }) {
  const error = props.state === 'error';
  const connected = props.state === 'empty' ? props.connected : true;
  // Connected with countdowns, but every one is switched off in this widget's settings.
  const nonePicked = props.state === 'empty' && props.nonePicked === true;
  const title = error ? props.message : !connected ? 'Open Hidl to connect' : nonePicked ? 'Nothing picked yet' : 'Add a countdown';
  const hint = error
    ? 'Tap to open Hidl'
    : !connected
      ? 'Sign in once and I’ll count for you.'
      : nonePicked
        ? 'Tap to choose what I count down.'
        : 'Hidi is ready to count with you!';
  const uri = !connected || error ? undefined : nonePicked ? settingsUri(props.widgetId) : `hidl://open?path=${encodeURIComponent('/countdown/new')}`;
  return (
    <FlexWidget
      clickAction={uri ? 'OPEN_URI' : 'OPEN_APP'}
      clickActionData={uri ? { uri } : undefined}
      style={{
        width: 'match_parent',
        height: 'match_parent',
        padding: small ? 12 : 16,
        flexDirection: small ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Hidi mood={error ? 'sleepy' : 'calm'} width={small ? 56 : 76} />
      <FlexWidget style={{ flex: small ? undefined : 1, marginLeft: small ? 0 : 14, marginTop: small ? 6 : 0, flexDirection: 'column' }}>
        <Text text={title} size={small ? 15 : 20} color={look.text} font={FONT.roundHeavy} lines={2} align={small ? 'center' : undefined} />
        {!small && <Text text={hint} size={13} color={look.soft} lines={2} marginTop={2} />}
      </FlexWidget>
    </FlexWidget>
  );
}

/** What Hidi says: "3 days to go. Almost there!" (just the line on the day and after it). */
function speech(shown: Shown) {
  if (shown.bigIsWord || !shown.chips[0] || shown.mood === 'party' || shown.mood === 'sleepy') return shown.line;
  return `${shown.big} ${shown.chips[0]} ${shown.mood === 'nervous' ? 'left' : 'to go'}. ${shown.line}`;
}

/** "Mon, Nov 16" in the owner's zone; plain if this phone can't format time zones. */
function dateOf(targetAt: string, tz?: string) {
  const d = new Date(targetAt);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
  } catch {
    return d.toDateString().slice(0, 10);
  }
}

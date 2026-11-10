import { FlexWidget, ListWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { FONT, LOOKS, type Look, type LookName } from './look';
import { accentOf, chevronSvg, hidiHeight, hidiSvg, kindLineSvg } from './hidi';
import { describe, type Mood, type Shown, type WidgetCountdown } from './mood';

/** The three entries in the widget picker (app.json). "Countdown" is the original, kept so
 *  widgets already on home screens keep working; it's the medium one. */
export const WIDGET_NAMES = ['CountdownSmall', 'Countdown', 'CountdownLarge'] as const;
export const WIDGET_NAME = 'Countdown';

/** clickAction names, handled in task-handler.tsx. */
export const PREV = 'PREV_COUNTDOWN';
export const NEXT = 'NEXT_COUNTDOWN';
export const SELECT = 'SELECT_COUNTDOWN';

export type Size = { width: number; height: number };
export type WidgetItem = WidgetCountdown & { id?: string };

export type WidgetProps =
  | { state: 'ready'; items: WidgetItem[]; index: number; tz?: string; now: number; stale?: boolean; size: Size; look: LookName }
  | { state: 'empty'; connected: boolean; size: Size; look: LookName }
  | { state: 'error'; message: string; size: Size; look: LookName };

/**
 * The size breakpoints: what's drawn depends on the widget's real size, so any of the three
 * picker entries stays readable when resized.
 */
export function layoutFor(size: Size): 'small' | 'medium' | 'large' {
  if (size.width < 230) return 'small';
  if (size.height >= 280) return 'large';
  return 'medium';
}

/** Opens the website page for one countdown in the app (App.tsx handles hidl://open). */
export function countdownUri(id?: string) {
  return `hidl://open?path=${encodeURIComponent(id ? `/countdown#c-${id}` : '/countdown')}`;
}

/**
 * The hidl home-screen widget, "chunky" style: a teal (or near-black) frame with "hidl" on it, a
 * white (or lighter) card on a darker bottom edge like a pressed button, Hidi in a mood that
 * follows the date with a speech bubble, and big rounded numbers. Drawn to a picture by
 * react-native-android-widget, so only its primitives work here (no React Native views, no
 * fragments), and nothing animates or ticks between redraws.
 */
export function CountdownWidget(props: WidgetProps) {
  const look = LOOKS[props.look];
  const layout = layoutFor(props.size);
  const { height } = props.size;

  let body: React.JSX.Element;
  if (props.state !== 'ready' || props.items.length === 0) {
    body = <EmptyCard look={look} layout={layout} props={props} />;
  } else {
    const item = props.items[props.index];
    const shown = describe(item, props.now, props.tz);
    body =
      layout === 'small' ? (
        <SmallCard look={look} item={item} shown={shown} count={props.items.length} index={props.index} height={height} />
      ) : layout === 'large' ? (
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column' }}>
          <Header look={look} stale={props.stale} right={<Text text={`${props.items.length} countdown${props.items.length === 1 ? '' : 's'}`} size={12} color={look.onBgSoft} font={FONT.mono} />} />
          <ListCard look={look} items={props.items} index={props.index} now={props.now} tz={props.tz} shown={shown} />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column' }}>
          <Header
            look={look}
            stale={props.stale}
            compact={height < 210}
            right={props.items.length > 1 ? <Pager look={look} count={props.items.length} index={props.index} /> : undefined}
          />
          <FeaturedCard look={look} item={item} shown={shown} tz={props.tz} height={height} />
        </FlexWidget>
      );
  }

  const flips = props.state === 'ready' && props.items.length > 1;
  return (
    <FlexWidget
      // The small widget flips on a tap; the others open hidl from anywhere outside the buttons.
      clickAction={layout === 'small' && flips ? NEXT : 'OPEN_APP'}
      accessibilityLabel="hidl countdowns"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: look.bg,
        borderRadius: 28,
        padding: layout === 'small' ? 8 : height < 210 ? 9 : 12,
        flexDirection: 'column',
      }}
    >
      {body}
    </FlexWidget>
  );
}

// ---- building blocks

/** A white (or lighter) card on a darker edge that's thicker at the bottom: a pressed button. */
function Chunky({ look, children, flex, clickAction, uri, marginTop = 0, padding = 12, center }: {
  look: Look; children: React.ReactNode; flex?: number; clickAction?: string; uri?: string; marginTop?: number; padding?: number; center?: boolean;
}) {
  return (
    <FlexWidget
      clickAction={clickAction ?? (uri ? 'OPEN_URI' : undefined)}
      clickActionData={uri ? { uri } : undefined}
      style={{ width: 'match_parent', ...(flex ? { flex } : {}), marginTop, backgroundColor: look.edge, borderRadius: 22, paddingBottom: 5 }}
    >
      <FlexWidget
        style={{
          width: 'match_parent',
          ...(flex ? { flex: 1 } : {}),
          backgroundColor: look.card,
          borderRadius: 22,
          padding,
          flexDirection: 'column',
          ...(center ? { alignItems: 'center', justifyContent: 'center' } : {}),
        }}
      >
        {children}
      </FlexWidget>
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

/** Hidi and "hidl" on the frame, with the arrows and dots (or a count) on the right. */
function Header({ look, stale, right, compact }: { look: Look; stale?: boolean; right?: React.JSX.Element; compact?: boolean }) {
  return (
    <FlexWidget style={{ width: 'match_parent', height: compact ? 34 : 40, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, marginBottom: compact ? 4 : 6 }}>
      <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <Hidi mood="calm" width={compact ? 24 : 28} />
        <Text text="hidl" size={compact ? 17 : 19} color={look.onBg} font={FONT.roundHeavy} marginLeft={6} />
        {stale && <Text text="· offline" size={10} color={look.onBgSoft} font={FONT.mono} marginLeft={6} />}
      </FlexWidget>
      {right}
    </FlexWidget>
  );
}

/** ‹ ••• › : glassy buttons on the frame with the page dots between them. */
function Pager({ look, count, index }: { look: Look; count: number; index: number }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Arrow look={look} dir="left" />
      <Dots on={look.dot} off={look.dotOff} count={count} index={index} textColor={look.onBg} />
      <Arrow look={look} dir="right" />
    </FlexWidget>
  );
}

/** 32dp visible, inside a 40dp tap area. */
function Arrow({ look, dir }: { look: Look; dir: 'left' | 'right' }) {
  return (
    <FlexWidget
      clickAction={dir === 'left' ? PREV : NEXT}
      accessibilityLabel={dir === 'left' ? 'Previous countdown' : 'Next countdown'}
      style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
    >
      <FlexWidget
        style={{
          width: 32,
          height: 30,
          backgroundColor: look.button,
          borderColor: look.buttonLine,
          borderWidth: 1.5,
          borderRadius: 10,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <SvgWidget svg={chevronSvg(dir, look.onBg)} style={{ width: 16, height: 16 }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** The one on show is a pill, the rest small dots; a "3/9" past six. */
function Dots({ on, off, count, index, textColor }: { on: string; off: string; count: number; index: number; textColor: string }) {
  if (count > 6) return <Text text={`${index + 1}/${count}`} size={11} color={textColor} font={FONT.mono} />;
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 2 }}>
      {Array.from({ length: count }, (_, i) => (
        <FlexWidget
          key={i}
          style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, marginHorizontal: 2, backgroundColor: (i === index ? on : off) as `#${string}` }}
        />
      ))}
    </FlexWidget>
  );
}

/** Hidi with what Hidi says, in a soft bubble. */
function HidiSays({ look, shown, hidi, size = 14, marginBottom = 8 }: { look: Look; shown: Shown; hidi: number; size?: number; marginBottom?: number }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginBottom }}>
      <Hidi mood={shown.mood} width={hidi} />
      <FlexWidget style={{ flex: 1, marginLeft: 10, backgroundColor: look.bubble, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text text={speech(shown)} size={size} color={look.text} lines={2} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** A unit chip: "days", "21h". */
function Chip({ look, text, size = 13, marginLeft = 0, marginTop = 0 }: { look: Look; text: string; size?: number; marginLeft?: number; marginTop?: number }) {
  return (
    <FlexWidget style={{ backgroundColor: look.chip, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft, marginTop }}>
      <Text text={text} size={size} color={look.text} />
    </FlexWidget>
  );
}

/** Big number with its unit chips beside it: "5" [days] [21h]; a word on the day itself. */
function BigNumber({ look, shown, size }: { look: Look; shown: Shown; size: number }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
      <Text text={shown.big} size={shown.bigIsWord ? Math.round(size * 0.6) : size} color={look.text} font={FONT.roundHeavy} />
      {shown.chips.slice(0, 2).map((c, i) => (
        <Chip key={c} look={look} text={c} marginLeft={i ? 5 : 7} />
      ))}
    </FlexWidget>
  );
}

/** A thick rounded bar: how far from "made" to "the day". */
function Bar({ look, progress, height = 10, marginTop = 10 }: { look: Look; progress: number | null; height?: number; marginTop?: number }) {
  if (progress === null) return null;
  const filled = Math.max(Math.round(progress * 1000), 40);
  return (
    <FlexWidget style={{ width: 'match_parent', height, marginTop, backgroundColor: look.track, borderRadius: height / 2, flexDirection: 'row' }}>
      <FlexWidget style={{ flex: filled, height, backgroundColor: look.fill, borderRadius: height / 2 }} />
      {filled < 1000 && <FlexWidget style={{ flex: 1000 - filled, height }} />}
    </FlexWidget>
  );
}

// ---- the layouts

/** Medium: Hidi and the bubble (when there's room), the title and date, the big number, the bar. */
function FeaturedCard({ look, item, shown, tz, height }: { look: Look; item: WidgetItem; shown: Shown; tz?: string; height: number }) {
  const roomy = height >= 210;
  const withHidi = height >= 172;
  return (
    <Chunky look={look} flex={1} uri={countdownUri(item.id)} padding={roomy ? 14 : 10}>
      {withHidi && <HidiSays look={look} shown={shown} hidi={roomy ? 54 : 38} size={roomy ? 14 : 12} marginBottom={roomy ? 8 : 4} />}
      <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
            <SvgWidget svg={kindLineSvg(item.kind, look.icon)} style={{ width: roomy ? 18 : 16, height: roomy ? 18 : 16 }} />
            <Text text={item.title} size={roomy ? 17 : 15} color={look.text} font={FONT.roundHeavy} marginLeft={6} flex={1} />
          </FlexWidget>
          <Text text={dateOf(item.targetAt, tz)} size={roomy ? 13 : 11} color={look.muted} />
        </FlexWidget>
        <BigNumber look={look} shown={shown} size={roomy ? 40 : 32} />
      </FlexWidget>
      <Bar look={look} progress={shown.progress} height={roomy ? 10 : 8} marginTop={roomy ? 8 : 6} />
    </Chunky>
  );
}

/** 2×2: Hidi, the big number on a soft tile, its unit, the title and the dots. A tap flips. */
function SmallCard({ look, item, shown, count, index, height }: { look: Look; item: WidgetItem; shown: Shown; count: number; index: number; height: number }) {
  // Room left inside the frame's and the card's padding.
  const room = height - 16 - 21 - (count > 1 ? 12 : 0);
  const hidi = room >= 150 ? 46 : room >= 128 ? 36 : room >= 110 ? 26 : 0;
  const big = room >= 150 ? 34 : 28;
  return (
    <Chunky look={look} flex={1} padding={8} center>
      {hidi > 0 && <Hidi mood={shown.mood} width={hidi} />}
      <FlexWidget style={{ backgroundColor: look.chip, borderRadius: 12, paddingHorizontal: 12, marginTop: hidi ? 2 : 0 }}>
        <Text text={shown.big} size={shown.bigIsWord ? Math.round(big * 0.6) : big} color={look.text} font={FONT.roundHeavy} />
      </FlexWidget>
      {shown.chips[0] && <Chip look={look} text={shown.chips[0]} size={11} marginTop={4} />}
      <Text text={item.title} size={13} color={look.text} font={FONT.roundHeavy} align="center" marginTop={3} />
      {count > 1 && (
        <FlexWidget style={{ marginTop: 6 }}>
          <Dots on={look.cardDot} off={look.cardDotOff} count={count} index={index} textColor={look.muted} />
        </FlexWidget>
      )}
    </Chunky>
  );
}

/** 4×4: Hidi on the one on show, then every countdown; tapping a row shows it. */
function ListCard({ look, items, index, now, tz, shown }: { look: Look; items: WidgetItem[]; index: number; now: number; tz?: string; shown: Shown }) {
  return (
    <Chunky look={look} flex={1} padding={12} uri={countdownUri(items[index]?.id)}>
      <HidiSays look={look} shown={shown} hidi={54} />
      <FlexWidget style={{ width: 'match_parent', flex: 1 }}>
        <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
          {items.map((item, i) => {
            const on = i === index;
            return (
              <FlexWidget
                key={item.id ?? `${item.title}-${i}`}
                clickAction={SELECT}
                clickActionData={{ index: i }}
                style={{
                  width: 'match_parent',
                  height: 40,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor: (on ? look.rowOn : look.card) as `#${string}`,
                }}
              >
                <Text text={on ? '[/]' : '[ ]'} size={13} color={accentOf(item.kind)} font={FONT.mono} />
                <Text text={item.title} size={15} color={look.text} font={FONT.roundHeavy} marginLeft={8} flex={1} />
                <Text text={describe(item, now, tz).short} size={12} color={look.muted} font={FONT.mono} marginLeft={6} />
              </FlexWidget>
            );
          })}
        </ListWidget>
      </FlexWidget>
    </Chunky>
  );
}

function EmptyCard({ look, layout, props }: { look: Look; layout: ReturnType<typeof layoutFor>; props: WidgetProps }) {
  const error = props.state === 'error';
  const connected = props.state === 'empty' ? props.connected : true;
  const title = error ? props.message : connected ? 'Add a countdown' : 'Open hidl to connect';
  const hint = error ? 'Tap to open hidl' : connected ? 'Hidi is ready to count with you!' : 'Sign in once and I’ll count for you.';
  const small = layout === 'small';
  const card = (
    <Chunky
      look={look}
      flex={1}
      padding={small ? 10 : 14}
      uri={connected && !error ? `hidl://open?path=${encodeURIComponent('/countdown/new')}` : undefined}
      clickAction={connected && !error ? undefined : 'OPEN_APP'}
    >
      <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: small ? 'column' : 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Hidi mood={error ? 'sleepy' : 'calm'} width={small ? 50 : 60} />
        <FlexWidget style={{ flex: small ? undefined : 1, marginLeft: small ? 0 : 12, marginTop: small ? 4 : 0, flexDirection: 'column' }}>
          <Text text={title} size={small ? 14 : 18} color={look.text} font={FONT.roundHeavy} lines={2} align={small ? 'center' : undefined} />
          {!small && <Text text={hint} size={13} color={look.muted} lines={2} marginTop={2} />}
        </FlexWidget>
      </FlexWidget>
    </Chunky>
  );
  if (small) return card;
  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column' }}>
      <Header look={look} compact={props.size.height < 210} />
      {card}
    </FlexWidget>
  );
}

/** What Hidi says: "5 days to go. Almost there!" (just the line on the day and after it). */
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

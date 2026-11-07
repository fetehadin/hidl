import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { isDone, remainingText, updatedText, type CachedFeed } from '../feed';
import { colors } from '../theme';

export const WIDGET_NAME = 'Countdown';

type Props =
  | { state: 'ready'; cached: CachedFeed; stale?: string }
  | { state: 'empty' }
  | { state: 'error'; message: string };

/**
 * The home-screen widget. Rendered to native Android views (RemoteViews) by
 * react-native-android-widget, so only its primitives work here, not regular RN components.
 */
export function CountdownWidget(props: Props) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="hidl countdown"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: colors.card,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: colors.line,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <TextWidget text="hidl" style={{ fontSize: 12, fontWeight: 'bold', color: colors.teal }} />
      {props.state === 'ready' ? <Ready {...props} /> : <Message text={props.state === 'empty' ? 'Tap to connect a countdown' : props.message} />}
    </FlexWidget>
  );
}

function Ready({ cached, stale }: { cached: CachedFeed; stale?: string }) {
  const { feed, fetchedAt } = cached;
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column' }}>
      <TextWidget text={feed.title} maxLines={1} truncate="END" style={{ fontSize: 15, fontWeight: 'bold', color: colors.heading }} />
      <TextWidget
        text={remainingText(feed)}
        maxLines={1}
        style={{ fontSize: 34, fontWeight: '900', adjustsFontSizeToFit: true, color: isDone(feed) ? colors.fresh : colors.ink }}
      />
      <TextWidget text={stale ?? updatedText(fetchedAt)} maxLines={1} style={{ fontSize: 11, color: colors.muted }} />
    </FlexWidget>
  );
}

function Message({ text }: { text: string }) {
  return <TextWidget text={text} maxLines={3} style={{ fontSize: 14, fontWeight: '600', color: colors.heading }} />;
}

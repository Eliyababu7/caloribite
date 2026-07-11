import { StyleSheet, View, ViewStyle } from "react-native";

type ProgressBarProps = {
  value: number;
  max: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: ViewStyle;
};

export function ProgressBar({
  value,
  max,
  height = 10,
  trackColor = "#EADFD9",
  fillColor = "#FF6B57",
  style,
}: ProgressBarProps) {
  const safeValue = Math.max(value, 0);
  const safeMax = Math.max(max, 0);

  const percentage =
    safeMax > 0 ? Math.min((safeValue / safeMax) * 100, 100) : 0;

  return (
    <View
      style={[
        styles.track,
        {
          height,
          backgroundColor: trackColor,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${percentage}%`,
            backgroundColor: fillColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 999,
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
});

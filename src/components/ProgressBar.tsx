import { StyleSheet, View } from "react-native";

type ProgressBarProps = {
  value: number;
  max: number;
  height?: number;
};

export function ProgressBar({ value, max, height = 10 }: ProgressBarProps) {
  const percentage = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0;

  return (
    <View style={[styles.track, { height }]}>
      <View
        style={[
          styles.progress,
          {
            width: `${percentage}%`,
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
    backgroundColor: "#E5E7EB",
  },
  progress: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#0F766E",
  },
});

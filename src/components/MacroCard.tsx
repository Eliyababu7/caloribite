import { useMemo } from "react";
import {
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { calculateProgress } from "../services/nutrition/nutritionService";
import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";
import { ProgressBar } from "./ProgressBar";

type MacroCardProps = {
  label: string;
  current: number;
  target: number;
  unit?: string;
  fillColor?: string;
  style?: StyleProp<ViewStyle>;
};

export function MacroCard({
  label,
  current,
  target,
  unit = "g",
  fillColor,
  style,
}: MacroCardProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const progress = calculateProgress(current, target);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.topRow}>
        <Text style={styles.label}>{label}</Text>

        <Text style={styles.value}>
          {current}
          {unit} / {target}
          {unit}
        </Text>
      </View>

      <ProgressBar
        value={current}
        max={target}
        height={10}
        fillColor={fillColor ?? theme.colors.brand}
        accessibilityLabel={`${label} progress`}
        style={styles.progressBar}
      />

      <Text style={styles.hint}>{progress}% of daily target</Text>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const { colors } = theme;

  return StyleSheet.create({
    container: {
      marginBottom: 18,
    },

    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
      gap: 12,
    },

    label: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text,
    },

    value: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textSecondary,
      textAlign: "right",
    },

    progressBar: {
      marginBottom: 6,
    },

    hint: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  });
}

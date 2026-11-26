import 'package:material_ui/material_ui.dart';

class Palette {
  static const paper = Color(0xFFF8F4F1);
  static const paper2 = Color(0xFFF1ECE8);
  static const paper3 = Color(0xFFE8E1DD);
  static const ink = Color(0xFF1D1614);
  static const ink2 = Color(0xFF312926);
  static const muted = Color(0xFF615955);
  static const rule = Color(0xFFD9D3CF);
  static const accent = Color(0xFFEF8B7B);
  static const accentDeep = Color(0xFFBB3D31);
  static const error = Color(0xFFBE2323);
  static const success = Color(0xFF21763C);
  static const cotton = Color(0xFFFDFBF8);
}

ThemeData buildTheme() {
  const scheme = ColorScheme.light(
    primary: Palette.accentDeep,
    onPrimary: Palette.cotton,
    secondary: Palette.accent,
    onSecondary: Palette.ink,
    surface: Palette.paper,
    onSurface: Palette.ink,
    onSurfaceVariant: Palette.muted,
    surfaceContainerHighest: Palette.paper3,
    surfaceContainerHigh: Palette.paper2,
    outline: Palette.rule,
    outlineVariant: Palette.rule,
    error: Palette.error,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme);
  return base.copyWith(
    scaffoldBackgroundColor: Palette.paper,
    textTheme: base.textTheme
        .apply(bodyColor: Palette.ink, displayColor: Palette.ink)
        .copyWith(
          headlineMedium: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.8,
            height: 1.1,
          ),
          titleMedium: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.2,
          ),
        ),
    cardTheme: CardThemeData(
      color: Palette.cotton,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: Palette.rule),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Palette.cotton,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: Palette.rule),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: Palette.rule),
      ),
    ),
    navigationRailTheme: const NavigationRailThemeData(
      backgroundColor: Palette.paper2,
      indicatorColor: Palette.accent,
      selectedIconTheme: IconThemeData(color: Palette.ink),
      unselectedIconTheme: IconThemeData(color: Palette.muted),
      labelType: NavigationRailLabelType.all,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Palette.paper2,
      side: const BorderSide(color: Palette.rule),
      labelStyle: const TextStyle(fontSize: 12, color: Palette.ink2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    ),
    dividerColor: Palette.rule,
  );
}

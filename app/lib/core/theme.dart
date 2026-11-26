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

ThemeData buildTheme({bool dark = false}) {
  const lightScheme = ColorScheme.light(
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
  const darkScheme = ColorScheme.dark(
    primary: Color(0xFFFFB4A7),
    onPrimary: Color(0xFF571D17),
    secondary: Color(0xFFEF8B7B),
    onSecondary: Color(0xFF38110D),
    surface: Color(0xFF1D1918),
    onSurface: Color(0xFFF0DED9),
    onSurfaceVariant: Color(0xFFCDBDB8),
    surfaceContainerHighest: Color(0xFF49403D),
    surfaceContainerHigh: Color(0xFF302A28),
    outline: Color(0xFF766762),
    outlineVariant: Color(0xFF514642),
    error: Color(0xFFFFB4AB),
  );
  final scheme = dark ? darkScheme : lightScheme;
  final card = dark ? const Color(0xFF292321) : Palette.cotton;
  final base = ThemeData(useMaterial3: true, colorScheme: scheme);
  return base.copyWith(
    scaffoldBackgroundColor: scheme.surface,
    textTheme: base.textTheme
        .apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface)
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
      color: card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: card,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: scheme.surfaceContainerHigh,
      indicatorColor: scheme.secondary,
      selectedIconTheme: IconThemeData(color: scheme.onSecondary),
      unselectedIconTheme: IconThemeData(color: scheme.onSurfaceVariant),
      labelType: NavigationRailLabelType.all,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: scheme.surfaceContainerHigh,
      side: BorderSide(color: scheme.outlineVariant),
      labelStyle: TextStyle(fontSize: 12, color: scheme.onSurface),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    ),
    dividerColor: scheme.outlineVariant,
  );
}

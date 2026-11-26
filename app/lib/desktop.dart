import 'package:flutter/services.dart';
import 'package:hotkey_manager/hotkey_manager.dart';
import 'package:tray_manager/tray_manager.dart';
import 'package:window_manager/window_manager.dart';

class DesktopShell with TrayListener, WindowListener {
  DesktopShell({required this.onSearch});

  final void Function() onSearch;
  var trayAvailable = false;
  var hotkeyAvailable = false;

  Future<void> start() async {
    await windowManager.ensureInitialized();
    try {
      await trayManager.setIcon('assets/tray.png');
      await trayManager.setToolTip('MindCache');
      await trayManager.setContextMenu(
        Menu(
          items: [
            MenuItem(key: 'open', label: 'Open MindCache'),
            MenuItem(key: 'search', label: 'Search'),
            MenuItem.separator(),
            MenuItem(key: 'quit', label: 'Quit'),
          ],
        ),
      );
      trayManager.addListener(this);
      trayAvailable = true;
    } catch (_) {
      trayAvailable = false;
    }
    await windowManager.setPreventClose(trayAvailable);
    windowManager.addListener(this);
    try {
      await hotKeyManager.unregisterAll();
      await hotKeyManager.register(
        HotKey(
          key: PhysicalKeyboardKey.space,
          modifiers: [HotKeyModifier.control, HotKeyModifier.alt],
          scope: HotKeyScope.system,
        ),
        keyDownHandler: (_) => reveal(),
      );
      hotkeyAvailable = true;
    } catch (_) {
      hotkeyAvailable = false;
    }
  }

  Future<void> reveal({bool search = true}) async {
    await windowManager.show();
    await windowManager.focus();
    if (search) onSearch();
  }

  @override
  void onTrayIconMouseDown() => reveal(search: false);

  @override
  void onTrayIconRightMouseDown() => trayManager.popUpContextMenu();

  @override
  void onTrayMenuItemClick(MenuItem menuItem) {
    switch (menuItem.key) {
      case 'open':
        reveal(search: false);
      case 'search':
        reveal();
      case 'quit':
        windowManager.setPreventClose(false).then((_) => windowManager.close());
    }
  }

  @override
  void onWindowClose() => windowManager.hide();
}

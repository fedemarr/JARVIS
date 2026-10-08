using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class Program
{
    internal static readonly string Root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", ".."));
    internal static readonly string Channel = MakeChannel();
    static string MakeChannel() {
        using (var hash = SHA256.Create()) {
            byte[] digest = hash.ComputeHash(Encoding.UTF8.GetBytes(Root.ToLowerInvariant()));
            return "Local\\Jarvis." + BitConverter.ToString(digest).Replace("-", "").Substring(0, 16);
        }
    }
    [STAThread] static void Main(string[] args) {
        bool first;
        using (var mutex = new Mutex(true, Channel + ".Instance", out first)) {
            string command = args.Length > 0 && args[0] == "--hide" ? "Hide" : args.Length > 0 && args[0] == "--exit" ? "Exit" : "Show";
            if (!first) {
                try { using (var signal = EventWaitHandle.OpenExisting(Channel + "." + command)) signal.Set(); }
                catch (WaitHandleCannotBeOpenedException) { }
                return;
            }
            if (command != "Show") return;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try { Application.Run(new Companion()); }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Jarvis", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        }
    }
}

internal sealed class Companion : ApplicationContext
{
    readonly string profile = Path.Combine(Program.Root, "data", "jarvis-desktop-browser");
    readonly EventWaitHandle showSignal = new EventWaitHandle(false, EventResetMode.AutoReset, Program.Channel + ".Show");
    readonly EventWaitHandle hideSignal = new EventWaitHandle(false, EventResetMode.AutoReset, Program.Channel + ".Hide");
    readonly EventWaitHandle exitSignal = new EventWaitHandle(false, EventResetMode.AutoReset, Program.Channel + ".Exit");
    readonly NotifyIcon tray;
    readonly System.Windows.Forms.Timer timer;
    readonly ShortcutWindow hotkey;
    Process browser;
    bool pendingShow;
    DateTime lastLaunch = DateTime.MinValue;

    internal Companion() {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Abrir Jarvis   Ctrl + Alt + J", null, delegate { ShowApp(); });
        menu.Items.Add("Ocultar ventana", null, delegate { HideApp(); });
        menu.Items.Add("Conectar con esta PC", null, delegate { StartConnector(); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Salir de Jarvis", null, delegate { ExitThread(); });
        tray = new NotifyIcon { Text = "Jarvis - tu asistente", Icon = MakeIcon(), ContextMenuStrip = menu, Visible = true };
        tray.DoubleClick += delegate { ShowApp(); };
        hotkey = new ShortcutWindow(ShowApp);
        timer = new System.Windows.Forms.Timer { Interval = 300 };
        timer.Tick += delegate {
            if (exitSignal.WaitOne(0)) { ExitThread(); return; }
            if (hideSignal.WaitOne(0)) HideApp();
            if (showSignal.WaitOne(0)) ShowApp();
            if (pendingShow) Reveal();
        };
        timer.Start();
        StartConnector();
        ShowApp();
        tray.ShowBalloonTip(5000, "Jarvis esta en tu computadora", "Abrime con Ctrl + Alt + J o desde este icono. Activa manos libres en mi ventana para llamarme por voz.", ToolTipIcon.Info);
    }

    void StartConnector() {
        try {
            Process.Start(new ProcessStartInfo("powershell.exe", "-NoProfile -WindowStyle Hidden -File " + Quote(Path.Combine(Program.Root, "desktop-agent", "start.ps1"))) {
                WorkingDirectory = Program.Root, UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
            });
        } catch (Exception ex) { Report(ex); }
    }

    Process FindOwnBrowser() {
        // Adopt the existing Jarvis profile; never adopt a normal Chrome window.
        using (var query = new ManagementObjectSearcher("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'chrome.exe'"))
        using (var rows = query.Get()) {
            foreach (ManagementObject row in rows) {
                string command = row["CommandLine"] as string;
                if (command != null && command.IndexOf(profile, StringComparison.OrdinalIgnoreCase) >= 0 && command.IndexOf("--type=", StringComparison.OrdinalIgnoreCase) < 0) {
                    try { return Process.GetProcessById(Convert.ToInt32(row["ProcessId"])); }
                    catch (ArgumentException) { }
                }
            }
        }
        return null;
    }

    void ShowApp() {
        try {
            if (browser == null || browser.HasExited) {
                if (browser != null) browser.Dispose();
                browser = FindOwnBrowser();
            }
            if (browser == null || !HasWindow()) {
                if ((DateTime.UtcNow - lastLaunch).TotalSeconds < 4) return;
                string chrome = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe");
                if (!File.Exists(chrome)) chrome = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe");
                if (!File.Exists(chrome)) throw new FileNotFoundException("Se requiere Google Chrome para conservar la voz de Jarvis.");
                Directory.CreateDirectory(profile);
                var started = Process.Start(new ProcessStartInfo(chrome, "--user-data-dir=" + Quote(profile) + " --app=https://jarvis-eta-blue.vercel.app/?desktop=1 --no-first-run --no-default-browser-check --force-renderer-accessibility --autoplay-policy=no-user-gesture-required --window-size=1440,960") { UseShellExecute = false, WorkingDirectory = Program.Root });
                if (browser == null) browser = started; else started.Dispose();
                lastLaunch = DateTime.UtcNow;
            }
            pendingShow = true;
            Reveal();
        } catch (Exception ex) { Report(ex); }
    }
    bool HasWindow() { bool found = false; EachWindow(delegate(IntPtr h) { found = true; }); return found; }
    void HideApp() { pendingShow = false; EachWindow(delegate(IntPtr h) { ShowWindow(h, 0); }); }
    void Reveal() {
        bool found = false;
        EachWindow(delegate(IntPtr h) { ShowWindow(h, 9); SetForegroundWindow(h); found = true; });
        if (found) pendingShow = false;
    }
    void EachWindow(Action<IntPtr> action) {
        if (browser == null || browser.HasExited) return;
        uint ownedPid = (uint)browser.Id;
        EnumWindows(delegate(IntPtr h, IntPtr unused) {
            uint pid; GetWindowThreadProcessId(h, out pid);
            // Chrome also owns invisible utility windows: only its main UI class.
            var name = new StringBuilder(128); GetClassName(h, name, name.Capacity);
            if (pid == ownedPid && name.ToString() == "Chrome_WidgetWin_1" && GetWindow(h, 4) == IntPtr.Zero) action(h);
            return true;
        }, IntPtr.Zero);
    }
    protected override void ExitThreadCore() {
        timer.Stop(); timer.Dispose(); hotkey.Dispose();
        EachWindow(delegate(IntPtr h) { PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero); });
        tray.Visible = false; tray.Icon.Dispose(); tray.Dispose();
        showSignal.Dispose(); hideSignal.Dispose(); exitSignal.Dispose();
        if (browser != null) browser.Dispose();
        // The independent connector can finish an already-running ticket.
        base.ExitThreadCore();
    }
    static Icon MakeIcon() {
        using (var bitmap = new Bitmap(64, 64))
        using (var graphics = Graphics.FromImage(bitmap))
        using (var pen = new Pen(Color.Cyan, 3))
        using (var font = new Font("Segoe UI", 30, FontStyle.Bold)) {
            graphics.Clear(Color.FromArgb(5, 15, 35));
            graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            graphics.DrawEllipse(pen, 3, 3, 57, 57);
            graphics.DrawString("J", font, Brushes.Cyan, 16, 6);
            IntPtr handle = bitmap.GetHicon();
            try { using (var temporary = Icon.FromHandle(handle)) return (Icon)temporary.Clone(); }
            finally { DestroyIcon(handle); }
        }
    }
    void Report(Exception ex) {
        try { File.AppendAllText(Path.Combine(Program.Root, "data", "windows-app.log"), DateTime.UtcNow.ToString("s") + " " + ex.Message + Environment.NewLine); } catch { }
        tray.ShowBalloonTip(5000, "Jarvis", ex.Message, ToolTipIcon.Error);
    }
    static string Quote(string value) { return "\"" + value.Replace("\"", "") + "\""; }
    delegate bool WindowCallback(IntPtr handle, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr data);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr handle, uint command);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern int GetClassName(IntPtr handle, StringBuilder name, int max);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr handle, int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr handle);
}

internal sealed class ShortcutWindow : NativeWindow, IDisposable
{
    readonly Action show;
    internal ShortcutWindow(Action callback) {
        show = callback;
        CreateHandle(new CreateParams { Caption = "Jarvis hotkey", Parent = new IntPtr(-3) });
        RegisterHotKey(Handle, 1, 0x4003, (uint)Keys.J);
    }
    protected override void WndProc(ref Message message) { if (message.Msg == 0x0312) show(); base.WndProc(ref message); }
    public void Dispose() { UnregisterHotKey(Handle, 1); DestroyHandle(); }
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr handle, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr handle, int id);
}

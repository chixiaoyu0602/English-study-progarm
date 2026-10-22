$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$synth = $null
$stream = $null
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    Add-Type -AssemblyName System.Speech
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en-*' })
    if ($voices.Count -eq 0) {
        @{ ok = $false; code = 'no-voice'; error = 'No local English voice installed.' } | ConvertTo-Json -Compress
        exit 0
    }
    $voice = $voices | Where-Object { $_.VoiceInfo.Culture.Name -eq 'en-GB' } | Select-Object -First 1
    if ($null -eq $voice) { $voice = $voices[0] }
    $synth.SelectVoice($voice.VoiceInfo.Name)
    $synth.Rate = -1
    if ($request.action -eq 'probe') {
        $stream = New-Object System.IO.MemoryStream
        $synth.SetOutputToWaveStream($stream)
    } else { $synth.SetOutputToDefaultAudioDevice() }
    $mode = 'system'
    $ssml = ''
    if ($request.ipa) {
        try {
            $builder = New-Object -TypeName System.Speech.Synthesis.PromptBuilder -ArgumentList $voice.VoiceInfo.Culture
            $builder.AppendTextWithPronunciation([string]$request.word, [string]$request.ipa)
            $ssml = $builder.ToXml()
            $synth.Speak($builder)
            $mode = 'ipa'
        } catch {
            # Unsupported phonemes/voice: fall back visibly to the engine's lexicon.
            $synth.Speak([string]$request.word)
        }
    } else { $synth.Speak([string]$request.word) }
    $result = @{ ok = $true; mode = $mode; voice = $voice.VoiceInfo.Name; culture = $voice.VoiceInfo.Culture.Name }
    if ($null -ne $stream) {
        $synth.SetOutputToNull()
        $bytes = $stream.ToArray()
        $result.audioBytes = $bytes.Length
        $result.waveHeader = [System.Text.Encoding]::ASCII.GetString($bytes, 0, [Math]::Min(4, $bytes.Length))
        $result.ssml = $ssml
    }
    $result | ConvertTo-Json -Compress
} catch {
    @{ ok = $false; code = 'speech-failed'; error = 'Local speech synthesis failed.' } | ConvertTo-Json -Compress
} finally {
    if ($null -ne $synth) { $synth.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
}

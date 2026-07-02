cask "lede" do
  version "0.1.6"
  sha256 "e003d3d9987274296b55a4af803751c3e9f53287831743ef3e785e8c9e266d04"

  url "https://github.com/lede-md/lede/releases/download/v#{version}/Lede_#{version}_aarch64.dmg"
  name "Lede"
  desc "Fast, native Markdown editor"
  homepage "https://github.com/lede-md/lede"

  app "Lede.app"

  caveats <<~EOS
    Lede is not notarized. On first launch, right-click Lede.app and choose Open,
    or run:
      xattr -dr com.apple.quarantine "#{appdir}/Lede.app"
  EOS
end

{
  description = "HomeNodes development shell: Node and TypeScript for the frontend, Home Assistant's test harness for the integration";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      devShells = forAll (pkgs: {
        # Home Assistant's own package set, so the harness matches the core it was built against.
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_22
            pkgs.typescript_5
            pkgs.ruff
            (pkgs.home-assistant.python3Packages.python.withPackages (ps: [
              ps.pytest
              ps.pytest-homeassistant-custom-component
              ps.home-assistant-frontend
              ps.sqlalchemy
              ps.bleak-retry-connector
            ]))
          ];
        };
      });
    };
}

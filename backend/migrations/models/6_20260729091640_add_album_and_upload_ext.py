from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "t_album" (
    "created_time" TIMESTAMPTZ,
    "updated_time" TIMESTAMPTZ,
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL UNIQUE,
    "sort_order" DOUBLE PRECISION NOT NULL
);
COMMENT ON COLUMN "t_album"."name" IS '相册名称';
COMMENT ON COLUMN "t_album"."slug" IS 'URL 友好标识（唯一）';
COMMENT ON COLUMN "t_album"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON TABLE "t_album" IS '扁平相册（媒体库分组，无层级）。';
        ALTER TABLE "t_upload_record" ADD "album_id" BIGINT;
        ALTER TABLE "t_upload_record" ADD "title" VARCHAR(255);
        COMMENT ON COLUMN t_upload_record."album_id" IS '所属相册（可空，未分类）';
COMMENT ON COLUMN t_upload_record."title" IS '展示标题（可选）';
        ALTER TABLE "t_upload_record" ADD CONSTRAINT "fk_t_upload_t_album_48785bea" FOREIGN KEY ("album_id") REFERENCES "t_album" ("id") ON DELETE SET NULL;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_upload_record" DROP CONSTRAINT IF EXISTS "fk_t_upload_t_album_48785bea";
        ALTER TABLE "t_upload_record" DROP COLUMN "album_id";
        ALTER TABLE "t_upload_record" DROP COLUMN "title";
        DROP TABLE IF EXISTS "t_album";"""


MODELS_STATE = (
    "eJztXW1zm7gW/isePnXn9rYY89q5c2ec1O1m13U6trvbu8sOI0B2mGBwQWqb7fa/3xEYDB"
    "hjlBoHY31pE6QD+Dmy9DznHCnfuJVvQzd88T7wbWwh7lXvG+eBFeRe9YpNz3scWK+3DeQC"
    "AqYb9UXGOtPNDFEAorstgBvC5z3OhqEVOGvk+B73qudh1yUXfStEgeMtt5ew53zC0ED+Eq"
    "I7GHCven/+9bzHOZ4Nv8Iw+XV9bywc6Nq513Vs8uzouoEe1tG1K2d546E3UV/yQNOwfBev"
    "vG3/9QO6873UwPGiT7CEHgwAguQJKMDkE5AX3Hza5EPFL7vtEr9lxsaGC4BdlPnEprG9xh"
    "nG5HZuzEZzw+AoMLJ8j+DreIgA8o1bklf4tyYIg4Ei8ANZlURFkVRefd7jovfdbVK+xy+z"
    "RSu+VYTZzdubyZy8kB8AK3YvufA9sgEIxFaRM7boWwEkeBnIWcFdP7wGCJKWck8UbQs+sT"
    "fGL5Ifih5K/JFx0cYBqYeSLlsXbUfmKXwUQGDfeu7D5tUq4J/fvBvN5sN378njVmH4yY0A"
    "HM5HpEWIrj4Urj6Tf8r7K71J7/eb+c898mvvj9vJKELXD9EyiJ647Tf/gyPvBDDyDc//Yg"
    "A7M4yTqwlq359nvnZ4bT/a8UVb5viWOD7BKOP5zdtvHW9DFxI37Ph8tgKuu3fazZgdnntL"
    "HLwz+dbxME/nXo7v6VgyJVXHkiKovZe9PrkgCLyONVkWOZqJeSAocjoVk1+qJt/Zu+F4nM"
    "y2u7Or+bAL9/UdCKrn1diqgHaIgjP8Oq3AV8OF3hLdca96sliB5G/D6fXPw+kzWSx8RSab"
    "FiFqyuOcTEh0OOetGM6HcQ5dvKRBOOn/KGxbRtdy0Ao8XwNbgef3ghu15dFFDnIhDbypwX"
    "HwbdXgbQThEK9WIKCaJDImHURZqoWyVIFy1FZY9XwPQQ8Zd2jl7kI9h1/3UIyiXSfwrmKO"
    "o4/zHGlMUH32bvjxpxxxHN9O3ibdM164Ht9eFYf4PaYa3nH37i1+/Voju18xsqO2PLjrwL"
    "HK1BK0nBVwyxFObYoqKTZ6sTE+P7wr4H09ur55Nxw/6wvPhQjf8JPrIJhFXtydNnAQQM+i"
    "o8oZm9NNF9z15H/ciUZxrUFcMYZ3lkDkW/dGiADCIdVEUbA7IdqOFz38NIgL9WhHBevYRZ"
    "we6ydA+fV0+GZ+GowHdTAe7Md4UEI5PsPAcFZgSUWgC2bdWwUb4XcILEuG8y+z28kembLp"
    "X1wAHQv1/um5Togagpn7zwJ7FkGwZ2LHRY4XviCP+29Tw7wCawJPNdkr8rpC6I/cYIfs+Q"
    "Ey/MCGwa4/3rg+2EO082YFtyyIXWMBvRf8E7CR2w9X41Hv/XR0fTO72bghDclGjXmOMh0N"
    "x0WkIQisO+MztJBfAvZ89lvUsgfvonEXJpoqYTP7bXQ9v50WJ2mA4NIPHgzalF/B8HTx50"
    "6k/0jmdXFfnv3bAFsye/gBdJber/AhcsmNFyLgleqYfLr5OnPHM/PIBtzt1e13LgBf0sx1"
    "cTT6nhHnRuKZYzaf3lzPuQh1E1j3X0BgG3vgBwgFjokRLFlOrza2b36dQhdEn+UQ9sPkdh"
    "0CPzeBLIHrwsA5Elxvo7t1aaRGg84X/Mxgyw3D3aaVsCpeAR5YRh+JPJs8ad8g219zkhuI"
    "NYpPDJAzYGUoF1eGEv1PIdyS/p0IEZ8gcPm0ibvu4/sZuJhqAKcGHUS4kaBDslTQztN5Oy"
    "YdjiUdMnWjx1EOHVYM+TGYEwzXw9n18PWoSi+cgNSlqm0/p8sKuzqUListGaO7PEbHCos7"
    "WF/KCosv1PGssLhdhcVML3dZL7eo0LUZdFnassG05Y5oq5OK2ND240TWz3BOecqQepKI2C"
    "++MqmKOtorzpMw6XWh0iuqZzJw4NKsYDmjDtKERoKSwEU0GG+6d6H64xSbNRhLOFFxE4ut"
    "s9h62xxx/rH1CfwSlnG66PoBJuclfRh9uzj6xiLnHQygssj5hTqeRc7bFTlnR3KwIzm6hD"
    "PLVLAjOc4ZYXYkBzuSo+NHcgCM7so2DVYEilOL7i2BzRzMgU3XCe+gbcThXRrpVLQ9gnRq"
    "24jvsGhmpyuw0xU6tVSztBfb099GZsT29F/cnn6SqWIb+g9u6G86iVi1O6fookNJRbYvh2"
    "UXWXbxEoUSyy520PEsu9iu7CLbl8P25Zwxuiz00LZ9OUkh4OP35CTlhmc2mTzJhpwb7xN2"
    "yoVW0nRAYzmZbkxdXZy6Yut/JjheKzZeERovLk9wBRyqPU2pQQfhbaQYY33ne1TjNzXoQv"
    "S76YPgLX+1Bh5d3eHWpHsIN8JhLR97iK6eKGPCQK75d1A2m248BAMYn99ee8oose0e7I1M"
    "zysYhpQ5+IxJNxfBmjBX4lwihHFgQWNNCXbBrHujupGCB9P52wjgJ8PzabDOW7H4Tq34zn"
    "nUSk1Gv59rpVS4QuvH/HGlvNkJsX4/mry+mbw9a7wDWEr49oY88katTW7Qhj6EvqiI6kAW"
    "04hHeqUq0LGbxAjg2n0wPD8+jr3uGM5bdW/t69fjGqRb1Zy8K1hYQr57eVmWkL9Qx+9LyF"
    "Mkf5pMcAztleN9CKOUwk6KY9t4IMkBSEcDJz1ZnuPi8hxs0erg3MUWrQt1fJ0qMjLb02Y3"
    "szadi9Acfyv/GoThFz+wjTsQ3lGF1IuGHQz1NhIQO3FGuW2z1Ql2959HxHE0GV6NR6/PNQ"
    "rmghAZrr90PNolOW/ZvQX5fBfgXeoVuclYlM5Ye2VP3ojFOndinb4LqfcuZozYvsVj7Vsk"
    "oB5hz+J0c5uO7lXMDL1W7VMcYttBY39ZGldK2g6FlUg/shqxqNJlRpWIXqSejDNGbDKmdE"
    "Xb5P1TQ9+wwAdWslWj9kFQqUUHAW5E0gcwrsKiS11vbTqIcyPKPoAheWU6lDcWHcT4+KLe"
    "WdOAG/fuXlTq+JMwS11dUOqqJWn3SJSWKKNErFapokQXM0F0eYKIbSdserOQTXmiod3NZG"
    "ZDVHwFgns6iphYdI/JHI2FP+ocAaLVf/AggVx5WFdOE9jJBaxhsHLC0PG9H4SLrO3v05t1"
    "CbOmmVIGtT2cKY/rIfaU8WktIsVNr4bX5BwhrQ/I8UILLfl5sSD/qpot6FgVFKGnY6Gvkf"
    "9kRRyQM4ckXseKyvdJX17VsaYqko41RRb+pWN5wGs61kQAdaxAoESdNB0PeF7QsSxBYixA"
    "S8cKsMz8TSVTgzoWF9JAx6oqq7EVV/Dkmb16CTH9M00Ebb1mROvuX4yzngNnLbqNpo5p15"
    "Qx2Zpci+WxWR67A3nsJ/6bnUPXxKvSHHbUcCiBnXY6SDF0LAtiX8cSVAY6VuQFOcKwr1rJ"
    "4isBTUjWTAlq5F+Bl8naa4lRHytZdSVLFHbX5B1i0PQDdU/3dCxCHkb3lciyb2rJ3cWoty"
    "Ra/Zc6Vm1R1LFqgkVyA1WDhBvwgpwQlewLSgMIdCzLwkLHik3OdpSViKzIqqhjge9Hr6Yq"
    "5DELmRCegRZdt5MXFyFvk1e2CQCmBsiViCAJoJ/nJxXMhNGPc6AfLLx/QeF9tjOl446vsz"
    "Oli0FyrrACitH6pS14ri2Co3sn8XIfpmMSOhmQ+IWkKbaOZZVXCFOx5JQmSYSFiJDnY+7y"
    "KH/UOlquX3G2XNR2aWf3Ego7ICRVguoijTD1rZTlqbZKOJ3FL5KfNUUmhFUQ4w9+Nqf+4r"
    "XrA/sHA9AfoptMoeUHdmsWrFiHRCpCgqU6ZAAJzQcKSFWHIoBUjViKSfPFe5IYdg74Ei1Z"
    "dEyVpIxHghFsO9eQliLkicRZEKmkmiZBeyFJKcLygiAviMrLvOyTIVFkMtT4A0ry6Pdnao"
    "upLUa620K6mdq6UMfXOgcgoNowvel+HlrLXGgvozChneROVdNc6FiTIOx9mI65thyZuXBc"
    "aNDq3pxRyx0iDbQFEWFRKjkb2hX5mlS+UHwjSXWKbyRpf/ENaStILudvSHPs4KZ7azfhEt"
    "xNiQheQY2S+krdcMORN+XGpBfahkl1jnfBrMUlZAUOLUIzVjuqjhWTpCQUkagdSSR/2UqR"
    "BJWopoGSBIIeG3g4fjE9clBZtnO/j1KDdntHsoieUbQBSIJAmqqpeY2q8UTCPNYXjcxIUQ"
    "KSugwga/WoyamToYNWFBOkGeUfrCZI09eX6Mm6NQnZ70GuKGE2mvcmH8bjp6pKmEGE4g+4"
    "E0tKmg6EkcJMtxoBJE0SSBqfH1gJEdb6IslALGRYWX5IZ/oDYZ97SEUNNt3bm3x4+lqy/U"
    "Gez8DFJYv8HH7ds6CkBic8wol7ghOERh/nOdWeoPrs3fDjTznlPr6dvE26Z7xwPb692jnL"
    "yYRUCjs16ADYJ9i3nH0zCpQLZp3D+mhhipbsuBzCwLHuSiv54pbKBRNs+7Rm1+WlZDR+MI"
    "pQsYzBIKT81mdM2hwwe+z82ogEXVOdW7Dp3kF0G9qw6iEYf7XzCP8yu53s27OamhQTLY6F"
    "ev/0XCf+I2xnhvb3/eASMKqJWZGDFfIk5AaEmD3pYvb9//VDEYk="
)

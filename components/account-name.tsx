export function AccountName({ name, tag, profileTag }: { name: string; tag?: string; profileTag?: string }) {
  const content = <><span className="account-nickname">{name}</span>{tag && <small className="account-tag">#{tag}</small>}</>;
  return profileTag ? <a className="account-name profile-link" href={`/u/${encodeURIComponent(profileTag)}`} aria-label={`查看 ${name} 的主页`}>{content}</a> : <span className="account-name">{content}</span>;
}
